// In-process job queue. Audits are slow (seconds) so the API answers
// immediately with an id, and the browser polls for progress.
// Concurrency and queue length are capped so a burst of requests cannot
// exhaust the (free, small) server.

import { runAudit } from './audit.js';
import { friendlyError } from './crawler/crawler.js';

export class AuditQueue {
  constructor({ store, config, log, resolver, runner = runAudit }) {
    this.store = store;
    this.config = config;
    this.log = log;
    this.resolver = resolver;
    this.runner = runner;
    this.waiting = [];
    this.running = 0;
    this.idleResolvers = [];
  }

  get size() {
    return this.waiting.length + this.running;
  }

  isFull() {
    return this.waiting.length >= this.config.limits.maxQueuedAudits;
  }

  enqueue(id, url) {
    this.waiting.push({ id, url });
    this.#save(this.store.setStatus(id, 'queued', { phase: 'queued', position: this.waiting.length }));
    this.#pump();
  }

  #pump() {
    while (this.running < this.config.limits.maxConcurrentAudits && this.waiting.length) {
      const job = this.waiting.shift();
      this.running++;
      this.#run(job).finally(() => {
        this.running--;
        this.#pump();
        if (this.size === 0) this.idleResolvers.splice(0).forEach((r) => r());
      });
    }
  }

  async #run({ id, url }) {
    const started = Date.now();
    await this.store.setStatus(id, 'running', { phase: 'starting', pagesCrawled: 0 }).catch((err) => this.log?.warn({ auditId: id, err: err.message }, 'status not saved'));
    try {
      const report = await this.runner(url, {
        config: this.config,
        resolver: this.resolver,
        log: this.log,
        onProgress: (p) => this.#save(this.store.setStatus(id, 'running', p)),
      });
      await this.store.saveResult(id, report);
      this.log?.info({ auditId: id, durationMs: report.durationMs, pages: report.stats.pagesCrawled, score: report.score.overall }, 'audit done');
    } catch (err) {
      const error = friendlyError(err);
      if (error.code === 'internal_error') this.log?.error({ auditId: id, err: err.stack }, 'audit crashed');
      else this.log?.info({ auditId: id, code: error.code }, 'audit failed');
      await this.store.saveError(id, error, Date.now() - started).catch((e) => this.log?.error({ auditId: id, err: e.message }, 'error not saved'));
    }
  }

  #save(promise) {
    promise.catch((err) => this.log?.warn({ err: err.message }, 'status not saved'));
  }

  /** Resolves when no job is waiting or running (used by tests and shutdown). */
  idle() {
    return this.size === 0 ? Promise.resolve() : new Promise((r) => this.idleResolvers.push(r));
  }
}
