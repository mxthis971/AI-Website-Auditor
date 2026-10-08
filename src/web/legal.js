// Legal pages. DRAFTS written to describe what the code actually does.
// They are NOT legal advice and must be reviewed before a commercial launch.
// Placeholders in [brackets] must be completed by the publisher.

export function legalPages(config) {
  const days = config.reportRetentionDays;
  const draftEn = '<p class="notice">Draft: to be reviewed by the publisher before commercial launch.</p>';
  const draftFr = '<p class="notice">Brouillon : à faire relire par l’éditeur avant le lancement commercial.</p>';
  const privacyAlt = [{ lang: 'en', path: '/privacy' }, { lang: 'fr', path: '/fr/confidentialite' }];
  const termsAlt = [{ lang: 'en', path: '/terms' }, { lang: 'fr', path: '/fr/conditions' }];
  const legalAlt = [{ lang: 'en', path: '/legal' }, { lang: 'fr', path: '/fr/mentions-legales' }];

  return [
    {
      path: '/privacy',
      lang: 'en',
      alternates: privacyAlt,
      title: 'Privacy Policy · AI Website Auditor',
      description: 'What data AI Website Auditor processes, why, and for how long.',
      body: `${draftEn}<h1>Privacy policy</h1>
<h2>What we collect</h2>
<ul>
<li><strong>The URL you audit</strong> and the resulting report (public, technical data about that website).</li>
<li><strong>No account, no name, no email</strong> is required to run an audit.</li>
<li><strong>IP addresses</strong> are used in memory only, to limit abuse (rate limiting). They are not written to our database or logs.</li>
<li><strong>Payments</strong> (when enabled) are processed by Stripe. We never see or store card details; we only store a payment reference linked to the report.</li>
<li><strong>Advertising cookies</strong>: pages show ads from Google AdSense. Google may use cookies to show and measure ads; in the EU/UK they are only used for personalised ads if you consent through the consent banner. See <a href="https://policies.google.com/technologies/partner-sites" rel="noopener">how Google uses data from partner sites</a>.</li>
<li><strong>Local storage</strong>: your browser keeps the private key that lets you delete your own reports; it never leaves your device except when you use it.</li>
</ul>
<h2>Why</h2>
<p>To produce the audit you requested (contract performance) and to protect the service against abuse (legitimate interest).</p>
<h2>How long</h2>
<p>Free reports are deleted automatically after ${days} days. Paid reports are kept so you can access what you bought; you can delete any report you created at any time from the report page.</p>
<h2>Sub-processors</h2>
<p>Hosting provider: [hosting provider]. Optional: Anthropic (AI explanations: only the technical audit results are sent, no personal data), Google PageSpeed Insights (receives the audited URL), Stripe (payments), Google AdSense (advertising).</p>
<h2>Your rights</h2>
<p>Under the GDPR you can request access, correction or deletion. Contact: [contact email]. You can also complain to your data protection authority (in France: CNIL).</p>`,
    },
    {
      path: '/fr/confidentialite',
      lang: 'fr',
      alternates: privacyAlt,
      title: 'Politique de confidentialité · AI Website Auditor',
      description: 'Quelles données AI Website Auditor traite, pourquoi et combien de temps.',
      body: `${draftFr}<h1>Politique de confidentialité</h1>
<h2>Ce que nous collectons</h2>
<ul>
<li><strong>L’URL auditée</strong> et le rapport produit (données techniques publiques sur ce site).</li>
<li><strong>Aucun compte, nom ou e-mail</strong> n’est nécessaire pour lancer un audit.</li>
<li><strong>Les adresses IP</strong> sont utilisées uniquement en mémoire pour limiter les abus. Elles ne sont écrites ni en base de données ni dans les journaux.</li>
<li><strong>Les paiements</strong> (lorsqu’ils sont activés) sont traités par Stripe. Nous ne voyons ni ne stockons jamais les données de carte ; seule une référence de paiement est liée au rapport.</li>
<li><strong>Cookies publicitaires</strong> : les pages affichent des annonces Google AdSense. Google peut utiliser des cookies pour afficher et mesurer les annonces ; dans l’UE, les annonces personnalisées ne sont utilisées qu’avec votre accord via la bannière de consentement. Voir <a href="https://policies.google.com/technologies/partner-sites?hl=fr" rel="noopener">comment Google utilise les données des sites partenaires</a>.</li>
<li><strong>Stockage local</strong> : votre navigateur conserve la clé privée qui vous permet de supprimer vos rapports.</li>
</ul>
<h2>Pourquoi</h2>
<p>Pour produire l’audit demandé (exécution du service) et protéger le service contre les abus (intérêt légitime).</p>
<h2>Combien de temps</h2>
<p>Les rapports gratuits sont supprimés automatiquement après ${days} jours. Les rapports payés sont conservés pour que vous puissiez y accéder ; vous pouvez supprimer à tout moment un rapport que vous avez créé.</p>
<h2>Sous-traitants</h2>
<p>Hébergeur : [hébergeur]. Optionnels : Anthropic (explications IA : seuls les résultats techniques sont envoyés), Google PageSpeed Insights (reçoit l’URL auditée), Stripe (paiements), Google AdSense (publicité).</p>
<h2>Vos droits</h2>
<p>Conformément au RGPD, vous pouvez demander l’accès, la rectification ou la suppression de vos données : [e-mail de contact]. Vous pouvez aussi saisir la CNIL.</p>`,
    },
    {
      path: '/terms',
      lang: 'en',
      alternates: termsAlt,
      title: 'Terms of Use · AI Website Auditor',
      description: 'Terms of use of AI Website Auditor.',
      body: `${draftEn}<h1>Terms of use</h1>
<p>AI Website Auditor provides automated technical audits of public websites. Results are generated automatically and may contain errors; they are recommendations, not guarantees of ranking, traffic or revenue.</p>
<p>Only audit websites you own or are authorised to analyse. Automated abuse (mass scanning, attempts to reach private networks) is forbidden and blocked.</p>
<p>The crawler identifies itself as "AIWebsiteAuditorBot", respects robots.txt for pages other than the one you submit, and limits the number of pages and requests.</p>
<p>Paid reports: digital content delivered immediately after payment. [Withdrawal right and refund policy to be defined by the publisher.]</p>
<p>Publisher: see the <a href="/legal">legal notice</a>.</p>`,
    },
    {
      path: '/fr/conditions',
      lang: 'fr',
      alternates: termsAlt,
      title: 'Conditions d’utilisation · AI Website Auditor',
      description: 'Conditions d’utilisation d’AI Website Auditor.',
      body: `${draftFr}<h1>Conditions d’utilisation</h1>
<p>AI Website Auditor fournit des audits techniques automatisés de sites publics. Les résultats sont générés automatiquement et peuvent contenir des erreurs ; ce sont des recommandations, sans garantie de positionnement, de trafic ou de chiffre d’affaires.</p>
<p>N’auditez que des sites dont vous êtes propriétaire ou que vous êtes autorisé à analyser. Les usages abusifs (scans massifs, tentatives d’accès à des réseaux privés) sont interdits et bloqués.</p>
<p>Le robot s’identifie comme « AIWebsiteAuditorBot », respecte robots.txt pour les pages autres que celle soumise et limite le nombre de pages et de requêtes.</p>
<p>Rapports payants : contenu numérique fourni immédiatement après paiement. [Droit de rétractation et politique de remboursement à définir par l’éditeur.]</p>
<p>Éditeur : voir les <a href="/fr/mentions-legales">mentions légales</a>.</p>`,
    },
    {
      path: '/legal',
      lang: 'en',
      alternates: legalAlt,
      title: 'Legal Notice · AI Website Auditor',
      description: 'Publisher and hosting information.',
      body: `${draftEn}<h1>Legal notice</h1><p>Publisher: [name or company, legal form, address, registration number, contact email].</p><p>Publication director: [name].</p><p>Hosting: [hosting provider name, address, phone].</p>`,
    },
    {
      path: '/fr/mentions-legales',
      lang: 'fr',
      alternates: legalAlt,
      title: 'Mentions légales · AI Website Auditor',
      description: 'Informations sur l’éditeur et l’hébergeur.',
      body: `${draftFr}<h1>Mentions légales</h1><p>Éditeur : [nom ou société, forme juridique, adresse, SIREN/SIRET, e-mail de contact].</p><p>Directeur de la publication : [nom].</p><p>Hébergeur : [nom, adresse, téléphone de l’hébergeur].</p>`,
    },
  ];
}
