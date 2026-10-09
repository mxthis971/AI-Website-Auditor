// Practical SEO guides in French, served at /fr/guides/<slug>.
// Each guide links to the free tool that checks what it explains.
// `body` is trusted HTML written here (never user data): code samples are
// already escaped (&lt; &gt;).

export const GUIDES_FR = [
  {
    slug: 'balise-title',
    tool: 'meta-tag-checker',
    title: 'Balise title : comment écrire un bon titre de page (avec exemples)',
    h1: 'Balise title : écrire un titre de page qui donne envie de cliquer',
    description: 'Longueur idéale, place du mot-clé, nom de marque, erreurs fréquentes : la méthode simple pour écrire la balise title de chaque page.',
    intro: 'La balise title est le texte bleu cliquable que Google affiche dans ses résultats. C’est souvent la première chose qu’un internaute lit de votre site : elle doit dire en quelques mots ce que contient la page.',
    body: `
<h2>Où se trouve la balise title ?</h2>
<p>Elle se place dans la partie <code>&lt;head&gt;</code> du code HTML de chaque page :</p>
<pre><code>&lt;head&gt;
  &lt;title&gt;Pain au levain bio à Lyon | Boulangerie Martin&lt;/title&gt;
&lt;/head&gt;</code></pre>
<p>Elle n’apparaît pas dans la page elle-même, mais dans l’onglet du navigateur, dans les résultats de Google et souvent lors d’un partage sur les réseaux sociaux.</p>

<h2>Les 5 règles d’un bon title</h2>
<ol>
  <li><strong>Un title différent pour chaque page.</strong> Si toutes vos pages s’appellent « Accueil », Google ne sait pas laquelle montrer.</li>
  <li><strong>Entre 15 et 60 caractères environ.</strong> Au-delà, Google coupe le texte avec « … » ; trop court, il ne décrit rien.</li>
  <li><strong>Le sujet principal au début.</strong> Les premiers mots comptent le plus, pour Google comme pour le lecteur qui survole la liste.</li>
  <li><strong>Le nom du site à la fin</strong>, séparé par <code>|</code> ou <code>–</code>. Il rassure sans prendre la place du sujet.</li>
  <li><strong>Écrit pour un humain.</strong> Une liste de mots-clés répétés (« pain, pain bio, pain Lyon ») fait fuir les clics et peut être réécrite par Google.</li>
</ol>

<h2>Exemples avant / après</h2>
<ul>
  <li>Avant : <code>Accueil</code> → Après : <code>Plombier à Bordeaux, dépannage 7j/7 | Dupont Plomberie</code></li>
  <li>Avant : <code>Produits</code> → Après : <code>Bougies artisanales à la cire de soja | Atelier Lumi</code></li>
  <li>Avant : <code>Blog - Mon super site - Article - Comment bien choisir ses chaussures de running en 2026</code> (trop long) → Après : <code>Choisir ses chaussures de running | Mon super site</code></li>
</ul>

<h2>Les erreurs les plus fréquentes</h2>
<ul>
  <li><strong>Title absent</strong> : souvent sur des pages créées à la main ou par un thème mal configuré.</li>
  <li><strong>Title dupliqué</strong> : le même texte copié sur des dizaines de pages.</li>
  <li><strong>Title vide ou générique</strong> : « Sans titre », « Page 1 », le nom du fichier.</li>
  <li><strong>Deux balises title</strong> dans la même page : un thème et une extension SEO qui en ajoutent chacun une.</li>
</ul>

<h2>Comment le modifier ?</h2>
<p>Sur WordPress, une extension SEO (Yoast, Rank Math…) ajoute un champ « Titre SEO » sous chaque page. Sur Shopify, Wix ou Squarespace, cherchez « Référencement » ou « SEO » dans les réglages de la page. Sur un site codé à la main, modifiez directement la balise dans le <code>&lt;head&gt;</code>.</p>
<p>Après modification, Google met en général quelques jours à quelques semaines pour afficher le nouveau titre : c’est normal.</p>`,
  },
  {
    slug: 'meta-description',
    tool: 'meta-tag-checker',
    title: 'Meta description : longueur, exemples et erreurs à éviter',
    h1: 'Meta description : le petit texte qui fait cliquer sur votre site',
    description: 'À quoi sert la meta description, combien de caractères écrire, comment la rédiger page par page et pourquoi Google la remplace parfois.',
    intro: 'La meta description est le court texte gris affiché sous le titre dans Google. Elle n’améliore pas directement votre position, mais elle peut faire la différence entre un clic chez vous et un clic chez le concurrent.',
    body: `
<h2>À quoi ressemble-t-elle dans le code ?</h2>
<pre><code>&lt;meta name="description" content="Pain au levain, viennoiseries et gâteaux faits maison chaque matin à Lyon 3e. Commande en ligne et retrait en boutique."&gt;</code></pre>
<p>Elle se place, comme la balise title, dans le <code>&lt;head&gt;</code> de la page.</p>

<h2>Quelle longueur choisir ?</h2>
<p>Visez <strong>entre 50 et 160 caractères</strong>. Au-delà, Google coupe le texte ; en dessous, il manque d’informations pour convaincre. Il n’existe pas de longueur « magique » : l’important est que la phrase soit complète et utile.</p>

<h2>La méthode en 3 parties</h2>
<ol>
  <li><strong>Ce que la page propose</strong> : « Bougies artisanales à la cire de soja… »</li>
  <li><strong>Ce qui vous distingue</strong> : « …coulées à la main en Bretagne, parfums naturels… »</li>
  <li><strong>Une invitation</strong> : « …Livraison offerte dès 40 €. »</li>
</ol>

<h2>Pourquoi Google affiche parfois un autre texte ?</h2>
<p>Google peut remplacer votre description par un extrait de la page s’il juge que cet extrait répond mieux à la recherche de l’internaute. Une description précise, propre à chaque page et fidèle à son contenu est la meilleure façon de limiter ce remplacement.</p>

<h2>Les erreurs à éviter</h2>
<ul>
  <li><strong>La même description partout</strong> : Google la considère alors comme peu utile.</li>
  <li><strong>Une description absente</strong> : Google choisit lui-même un morceau de texte, parfois un menu ou une mention de cookies.</li>
  <li><strong>Une promesse que la page ne tient pas</strong> : le visiteur repart aussitôt.</li>
  <li><strong>Des guillemets doubles non échappés</strong> dans le code, qui coupent la balise : écrivez <code>&amp;quot;</code> ou utilisez des guillemets français « ».</li>
</ul>

<h2>Par où commencer ?</h2>
<p>Commencez par vos pages les plus importantes : accueil, pages de services ou de produits phares, page contact. Une bonne description sur 10 pages clés vaut mieux qu’une description générique sur 200 pages.</p>`,
  },
  {
    slug: 'robots-txt',
    tool: 'robots-txt-checker',
    title: 'Fichier robots.txt : à quoi il sert et comment l’écrire sans erreur',
    h1: 'robots.txt : dire aux moteurs de recherche où ils peuvent aller',
    description: 'Le rôle du fichier robots.txt, sa syntaxe (User-agent, Disallow, Sitemap), un modèle prêt à l’emploi et l’erreur qui peut faire disparaître un site de Google.',
    intro: 'Le fichier robots.txt est un petit fichier texte placé à la racine de votre site. Il indique aux robots des moteurs de recherche les parties du site qu’ils peuvent explorer et celles qu’ils doivent ignorer.',
    body: `
<h2>Où le trouver ?</h2>
<p>Toujours à la même adresse : <code>https://votresite.fr/robots.txt</code>. S’il n’existe pas, les robots explorent tout le site, ce qui n’est pas grave pour un petit site.</p>

<h2>Un modèle simple</h2>
<pre><code>User-agent: *
Disallow: /admin/
Disallow: /panier/

Sitemap: https://votresite.fr/sitemap.xml</code></pre>
<ul>
  <li><code>User-agent: *</code> : la règle s’applique à tous les robots.</li>
  <li><code>Disallow: /admin/</code> : ne pas explorer ce dossier.</li>
  <li><code>Sitemap:</code> : l’adresse complète de votre plan de site, pour aider Google à trouver vos pages.</li>
</ul>

<h2>L’erreur qui peut tout casser</h2>
<pre><code>User-agent: *
Disallow: /</code></pre>
<p>Ces deux lignes interdisent l’exploration de <strong>tout le site</strong>. On les met souvent pendant la construction d’un site… et on oublie de les retirer à la mise en ligne. Si votre site n’apparaît pas du tout dans Google, vérifiez ce point en premier.</p>

<h2>Ce que robots.txt ne fait pas</h2>
<ul>
  <li><strong>Il ne cache pas une page</strong> : une page bloquée peut quand même apparaître dans Google si d’autres sites font un lien vers elle. Pour retirer une page des résultats, utilisez plutôt la balise <code>&lt;meta name="robots" content="noindex"&gt;</code> (et laissez la page explorable pour que Google la voie).</li>
  <li><strong>Il ne protège rien</strong> : le fichier est public. N’y listez jamais l’adresse d’une page secrète, vous la signaleriez à tout le monde.</li>
</ul>

<h2>Les bonnes habitudes</h2>
<ul>
  <li>Un seul fichier, à la racine, nommé exactement <code>robots.txt</code> en minuscules.</li>
  <li>Ne bloquez pas vos fichiers CSS et JavaScript : Google en a besoin pour voir la page comme un visiteur.</li>
  <li>Ajoutez toujours la ligne <code>Sitemap:</code>.</li>
  <li>Après chaque modification, testez le fichier.</li>
</ul>`,
  },
  {
    slug: 'sitemap-xml',
    tool: 'sitemap-checker',
    title: 'Sitemap XML : créer et déclarer le plan de votre site à Google',
    h1: 'Sitemap XML : donner à Google la liste de vos pages',
    description: 'Ce qu’est un sitemap XML, à quoi il ressemble, comment le générer (WordPress, Shopify, Wix…) et le déclarer dans Google Search Console.',
    intro: 'Un sitemap XML est la liste des pages de votre site que vous voulez voir dans Google. Image simple : c’est le plan du centre commercial que l’on donne au visiteur à l’entrée, pour qu’il ne rate aucune boutique.',
    body: `
<h2>À quoi ressemble un sitemap ?</h2>
<pre><code>&lt;?xml version="1.0" encoding="UTF-8"?&gt;
&lt;urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"&gt;
  &lt;url&gt;
    &lt;loc&gt;https://votresite.fr/&lt;/loc&gt;
    &lt;lastmod&gt;2026-10-01&lt;/lastmod&gt;
  &lt;/url&gt;
  &lt;url&gt;
    &lt;loc&gt;https://votresite.fr/services&lt;/loc&gt;
  &lt;/url&gt;
&lt;/urlset&gt;</code></pre>
<p>Chaque bloc <code>&lt;url&gt;</code> contient l’adresse complète d’une page (<code>&lt;loc&gt;</code>) et, si possible, sa date de dernière modification (<code>&lt;lastmod&gt;</code>).</p>

<h2>Comment l’obtenir ?</h2>
<ul>
  <li><strong>WordPress</strong> : un sitemap est créé automatiquement à l’adresse <code>/wp-sitemap.xml</code> ; les extensions SEO en proposent un plus complet (souvent <code>/sitemap_index.xml</code>).</li>
  <li><strong>Shopify, Wix, Squarespace</strong> : il est généré tout seul, en général à <code>/sitemap.xml</code>.</li>
  <li><strong>Site codé à la main</strong> : générez-le avec votre outil de construction ou écrivez-le à la main s’il y a peu de pages.</li>
</ul>

<h2>Le déclarer à Google</h2>
<ol>
  <li>Ouvrez Google Search Console et sélectionnez votre site.</li>
  <li>Menu <strong>Sitemaps</strong> → saisissez l’adresse du sitemap → <strong>Envoyer</strong>.</li>
  <li>Ajoutez aussi la ligne <code>Sitemap: https://votresite.fr/sitemap.xml</code> dans votre fichier robots.txt.</li>
</ol>
<p>Le message « Impossible de récupérer » juste après l’envoi est fréquent : Google réessaie de lui-même dans les jours qui suivent.</p>

<h2>Les erreurs fréquentes</h2>
<ul>
  <li><strong>Des pages en erreur</strong> (404) ou redirigées dans le sitemap : ne listez que des pages qui répondent normalement.</li>
  <li><strong>Des pages exclues</strong> (noindex) dans le sitemap : c’est contradictoire, Google ne sait plus quoi faire.</li>
  <li><strong>Des adresses relatives</strong> (<code>/services</code>) au lieu d’adresses complètes (<code>https://votresite.fr/services</code>).</li>
  <li><strong>Un mélange http / https ou avec / sans www</strong> : utilisez partout la version officielle de votre site.</li>
</ul>
<p>Un sitemap ne garantit pas qu’une page sera indexée, mais il aide Google à la découvrir plus vite, surtout sur un site récent qui a encore peu de liens.</p>`,
  },
  {
    slug: 'titres-h1-h2',
    tool: 'heading-checker',
    title: 'Balises H1, H2, H3 : bien structurer les titres d’une page',
    h1: 'H1, H2, H3 : organiser une page comme un bon sommaire',
    description: 'Combien de H1 par page, comment enchaîner H2 et H3, exemples de bonne structure et erreurs fréquentes pour le SEO et l’accessibilité.',
    intro: 'Les balises de titre (H1 à H6) découpent une page en parties, comme les titres et sous-titres d’un livre. Elles aident Google à comprendre le sujet de la page et permettent aux personnes qui utilisent un lecteur d’écran de naviguer facilement.',
    body: `
<h2>Le principe : un sommaire</h2>
<pre><code>&lt;h1&gt;Faire son pain au levain à la maison&lt;/h1&gt;
  &lt;h2&gt;Le matériel nécessaire&lt;/h2&gt;
  &lt;h2&gt;Préparer le levain&lt;/h2&gt;
    &lt;h3&gt;Jour 1 à 3 : le démarrage&lt;/h3&gt;
    &lt;h3&gt;Jour 4 à 7 : la stabilisation&lt;/h3&gt;
  &lt;h2&gt;La recette pas à pas&lt;/h2&gt;</code></pre>
<p>Lu à voix haute, ce plan suffit à comprendre de quoi parle la page. C’est le bon test.</p>

<h2>Les règles simples</h2>
<ol>
  <li><strong>Un seul H1 par page</strong>, qui annonce le sujet principal. Il ressemble souvent à la balise title, sans le nom du site.</li>
  <li><strong>Des H2 pour les grandes parties</strong>, des H3 pour les sous-parties d’un H2.</li>
  <li><strong>Pas de niveau sauté</strong> : on ne passe pas d’un H2 directement à un H4.</li>
  <li><strong>Des titres qui décrivent</strong> le contenu qui suit, plutôt que « Section 1 » ou « En savoir plus ».</li>
</ol>

<h2>Les erreurs fréquentes</h2>
<ul>
  <li><strong>Aucun H1</strong> : le titre de la page est un simple texte en gras ou une image de logo.</li>
  <li><strong>Plusieurs H1</strong> : le logo, le menu et le titre sont tous en H1 à cause du thème.</li>
  <li><strong>Des titres choisis pour leur taille</strong> : on met un H4 parce qu’il « fait joli ». La taille se règle en CSS, le niveau du titre doit refléter la structure.</li>
  <li><strong>Un H1 vide ou caché</strong>.</li>
</ul>

<h2>Comment corriger ?</h2>
<p>Dans la plupart des éditeurs (WordPress, Wix, Shopify…), chaque bloc de texte propose un menu « Titre 1, Titre 2… » ou « H1, H2… ». Choisissez le niveau selon la place du titre dans le plan, puis ajustez l’apparence dans les réglages du thème si besoin.</p>
<p>Une page bien structurée est plus facile à lire pour tout le monde : les visiteurs pressés la parcourent en lisant seulement les titres.</p>`,
  },
  {
    slug: 'accelerer-site-web',
    tool: 'website-speed-checker',
    title: 'Accélérer un site web : 8 actions concrètes pour gagner en vitesse',
    h1: 'Accélérer son site web : 8 actions concrètes, de la plus simple à la plus technique',
    description: 'Images trop lourdes, scripts bloquants, compression, cache, hébergement : les actions qui accélèrent réellement un site et améliorent les Core Web Vitals.',
    intro: 'Un site lent fait perdre des visiteurs, surtout sur mobile. Google tient aussi compte de l’expérience de chargement (les « Core Web Vitals »). Bonne nouvelle : les gains les plus importants viennent souvent des corrections les plus simples.',
    body: `
<h2>1. Alléger les images</h2>
<p>C’est la cause n°1 des pages lentes. Une photo de 4 Mo sortie d’un téléphone n’a rien à faire sur une page web.</p>
<ul>
  <li>Redimensionnez à la taille d’affichage réelle (souvent 1200 à 1600 pixels de large au maximum).</li>
  <li>Convertissez en <strong>WebP</strong> ou <strong>AVIF</strong>, des formats bien plus légers que le JPEG ou le PNG.</li>
  <li>Visez moins de 200 à 300 Ko par image.</li>
</ul>

<h2>2. Charger les images au bon moment</h2>
<pre><code>&lt;img src="photo.webp" alt="Notre boutique" width="800" height="600" loading="lazy"&gt;</code></pre>
<p><code>loading="lazy"</code> attend que l’image approche de l’écran pour la télécharger. Ne le mettez pas sur l’image principale tout en haut de la page. Indiquer <code>width</code> et <code>height</code> évite que la page « saute » pendant le chargement.</p>

<h2>3. Ne pas bloquer l’affichage avec les scripts</h2>
<pre><code>&lt;script src="app.js" defer&gt;&lt;/script&gt;</code></pre>
<p>Sans <code>defer</code> (ou <code>async</code>), le navigateur arrête tout pour télécharger et exécuter le script avant d’afficher la page.</p>

<h2>4. Activer la compression</h2>
<p>Les fichiers texte (HTML, CSS, JavaScript) peuvent être compressés en <strong>gzip</strong> ou <strong>Brotli</strong> par le serveur, ce qui divise souvent leur poids par 3 ou plus. La plupart des hébergeurs proposent une option à cocher.</p>

<h2>5. Utiliser le cache du navigateur</h2>
<p>Un visiteur qui revient ne devrait pas retélécharger votre logo et vos styles à chaque page. Le cache se règle sur le serveur (en-tête <code>Cache-Control</code>) ou via une extension de cache sur WordPress.</p>

<h2>6. Faire le tri dans les extensions et les outils tiers</h2>
<p>Chaque widget de chat, pixel publicitaire, police externe ou extension ajoute du poids. Retirez ce qui ne sert plus.</p>

<h2>7. Limiter les redirections</h2>
<p>Une adresse qui redirige vers une autre, qui redirige encore, fait attendre le visiteur à chaque étape. Faites pointer vos liens directement vers l’adresse finale.</p>

<h2>8. Vérifier le temps de réponse du serveur</h2>
<p>Si le serveur met plus d’une demi-seconde à répondre avant même d’envoyer la page, le problème vient de l’hébergement ou de l’application (base de données, extensions lourdes). Un hébergement plus adapté ou un cache de pages peut alors changer beaucoup de choses.</p>

<h2>Mesurer avant et après</h2>
<p>Notez la vitesse avant vos changements, corrigez un point à la fois, puis mesurez à nouveau : vous saurez ce qui a vraiment fonctionné.</p>`,
  },
];

export const GUIDE_BY_SLUG = Object.fromEntries(GUIDES_FR.map((g) => [g.slug, g]));
