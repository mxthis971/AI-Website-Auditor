// French versions of the free tool pages (same checks, French URL and text).
// Keyed by the English slug used in TOOLS and by the /api/tools endpoint.

export const TOOLS_FR = {
  'meta-tag-checker': {
    slug: 'verificateur-balises-meta',
    name: 'Vérificateur de balises meta',
    h1: 'Vérificateur de balises meta gratuit',
    title: 'Vérificateur de balises meta : title, description, canonical et robots',
    description: 'Vérifiez en quelques secondes la balise title, la meta description, la canonical, les balises robots et viewport de n’importe quelle page. Gratuit, sans inscription.',
    intro: 'Collez une URL pour voir exactement ce que les moteurs de recherche lisent dans le <head> de la page : title, meta description, URL canonique, directives robots, viewport et langue. Chaque problème est accompagné d’une explication et d’une correction prête à copier.',
    sections: [
      ['Pourquoi les balises meta comptent toujours', 'La balise title est le titre cliquable dans Google et l’un des signaux les plus forts de la page. La meta description ne change pas le classement, mais c’est l’argumentaire affiché sous ce titre : une bonne description peut nettement augmenter le taux de clic. Les balises canonical et robots décident si la page est indexée : une seule valeur erronée peut la faire disparaître des résultats.'],
      ['Ce que vérifie cet outil', 'La présence et la longueur du title (15 à 60 caractères) et de la meta description (50 à 160 caractères), une seule URL canonique, un « noindex » accidentel dans la balise meta robots ou l’en-tête X-Robots-Tag, la balise viewport mobile, l’encodage des caractères et l’attribut lang de la balise html.'],
      ['Les erreurs les plus fréquentes', 'Un « noindex » oublié depuis le site de préproduction ; le même title sur toutes les pages parce que le modèle du CMS n’a jamais été personnalisé ; deux balises canonical ajoutées par deux extensions différentes ; des titles de plus de 70 caractères que Google tronque.'],
    ],
    faq: [
      ['Quelle longueur pour une balise title ?', 'Visez 50 à 60 caractères. Google coupe selon la largeur en pixels : les lettres larges atteignent la limite plus vite. Placez le mot-clé principal au début et votre marque à la fin.'],
      ['Google utilise-t-il toujours ma meta description ?', 'Non. Google la réécrit quand il estime qu’un autre passage répond mieux à la recherche. Une description précise et fidèle est reprise bien plus souvent qu’une description générique.'],
      ['La balise meta keywords sert-elle à quelque chose ?', 'Non. Google ignore la balise meta keywords depuis 2009 : cet outil ne l’évalue donc pas.'],
    ],
  },
  'robots-txt-checker': {
    slug: 'verificateur-robots-txt',
    name: 'Vérificateur robots.txt',
    h1: 'Vérificateur de robots.txt',
    title: 'Vérificateur robots.txt : trouvez les règles qui bloquent Google',
    description: 'Téléchargez et testez votre robots.txt : détection de « Disallow: / », des pages bloquées et de la ligne Sitemap manquante. Gratuit et immédiat.',
    intro: 'Cet outil télécharge votre robots.txt, l’interprète comme les robots des moteurs de recherche (RFC 9309 : la règle la plus précise l’emporte, Allow l’emporte en cas d’égalité) et le teste sur les pages liées depuis votre page d’accueil.',
    sections: [
      ['Ce que fait robots.txt (et ce qu’il ne fait pas)', 'robots.txt indique aux robots quelles URL ils peuvent demander. Il ne cache pas une page des résultats : une URL bloquée peut quand même être indexée si d’autres sites pointent vers elle. Pour retirer une page de Google, utilisez une balise noindex et laissez-la explorable.'],
      ['L’erreur qui coûte le plus cher', 'Un « User-agent: * / Disallow: / » copié depuis un serveur de développement bloque tout le site. Le classement chute alors dans les jours et semaines qui suivent. Cet outil le signale comme critique.'],
      ['Bonnes pratiques', 'Gardez un robots.txt court, ne bloquez que les zones vraiment inutiles (administration, panier, résultats de recherche interne) et ajoutez une ligne Sitemap pour que chaque robot trouve votre sitemap.'],
    ],
    faq: [
      ['Où doit se trouver le fichier robots.txt ?', 'À la racine du domaine : https://www.exemple.fr/robots.txt. Un fichier placé dans un sous-dossier est ignoré, et chaque sous-domaine a besoin du sien.'],
      ['Une ligne Disallow vide pose-t-elle problème ?', 'Non. « Disallow: » sans valeur signifie « tout est autorisé ».'],
      ['Faut-il bloquer le CSS et le JavaScript ?', 'Non. Google affiche les pages comme un navigateur et a besoin de ces fichiers pour comprendre la mise en page et la compatibilité mobile.'],
    ],
  },
  'sitemap-checker': {
    slug: 'verificateur-sitemap',
    name: 'Vérificateur de sitemap',
    h1: 'Vérificateur de sitemap XML',
    title: 'Vérificateur de sitemap XML : trouvez et validez votre sitemap.xml',
    description: 'Trouvez votre sitemap XML (robots.txt, /sitemap.xml, /sitemap_index.xml), validez son format et comptez ses URL. Gratuit.',
    intro: 'Nous cherchons votre sitemap là où les robots le cherchent : la ligne Sitemap du robots.txt, puis /sitemap.xml et /sitemap_index.xml. Nous vérifions qu’il s’agit d’un vrai sitemap XML (urlset ou sitemapindex) et comptons les URL listées.',
    sections: [
      ['Quand le sitemap compte le plus', 'Les grands sites, les sites récents avec peu de liens entrants et les sites dont certaines pages sont difficiles à atteindre par les liens en profitent le plus. Pour un site de cinq pages c’est un plus ; pour une boutique en ligne c’est indispensable.'],
      ['Problèmes fréquents', 'Une page d’erreur HTML servie à l’adresse /sitemap.xml, un sitemap qui liste des URL redirigées ou en noindex, ou un sitemap qui existe mais n’est référencé nulle part.'],
      ['Étape suivante', 'Une fois le sitemap valide, soumettez-le dans Google Search Console et Bing Webmaster Tools, puis suivez les compteurs « Découvertes » et « Indexées ».'],
    ],
    faq: [
      ['Combien d’URL un sitemap peut-il contenir ?', 'Jusqu’à 50 000 URL ou 50 Mo non compressés par fichier. Les sites plus grands utilisent un index de sitemaps qui en liste plusieurs.'],
      ['Toutes les pages doivent-elles être dans le sitemap ?', 'Seulement les pages canoniques, indexables et qui répondent en HTTP 200. Excluez les redirections, les pages d’erreur et les pages en noindex.'],
    ],
  },
  'heading-checker': {
    slug: 'verificateur-titres-h1-h2',
    name: 'Vérificateur de titres H1-H6',
    h1: 'Vérificateur de titres H1 à H6',
    title: 'Vérificateur de titres : analysez la structure H1, H2, H3 d’une page',
    description: 'Affichez le plan H1 à H6 complet d’une page, trouvez les H1 manquants ou multiples et les niveaux sautés. Contrôle SEO et accessibilité gratuit.',
    intro: 'Les titres sont la table des matières d’une page. Cet outil extrait chaque titre dans l’ordre pour que vous voyiez le plan exactement comme les lecteurs d’écran et les moteurs de recherche.',
    sections: [
      ['Pourquoi la structure des titres compte', 'Les utilisateurs de lecteurs d’écran sautent de titre en titre pour parcourir une page, comme les autres visiteurs survolent les titres en gras. Les moteurs de recherche utilisent ce même plan pour comprendre le sujet principal et les sous-sujets.'],
      ['Règles simples', 'Un seul H1 qui décrit la page ; des H2 pour les grandes sections ; des H3 pour les sous-parties d’un H2 ; ne choisissez jamais un niveau pour sa taille de police (c’est le rôle du CSS).'],
    ],
    faq: [
      ['Avoir deux H1 est-il pénalisé par Google ?', 'Pas directement. Mais un seul H1 clair rend le sujet principal évident pour les visiteurs, les technologies d’assistance et les moteurs de recherche.'],
      ['Mon logo est un H1, est-ce une erreur ?', 'Sur les pages intérieures, oui : toutes les pages auraient le même H1. Gardez le logo comme lien ou image et donnez à chaque page son propre H1.'],
    ],
  },
  'open-graph-checker': {
    slug: 'verificateur-open-graph',
    name: 'Vérificateur Open Graph',
    h1: 'Vérificateur Open Graph et aperçu de partage',
    title: 'Vérificateur Open Graph : voyez l’aperçu de votre lien quand il est partagé',
    description: 'Vérifiez og:title, og:description, og:image et les balises Twitter Card, et prévisualisez la carte de partage. Gratuit, sans inscription.',
    intro: 'Quand quelqu’un partage votre lien sur LinkedIn, Facebook, WhatsApp, Slack ou X, ces plateformes lisent les balises Open Graph pour construire la carte d’aperçu. Cet outil montre ce qu’elles lisent et ce qui manque.',
    sections: [
      ['Les trois balises qui comptent', 'og:title (un titre court), og:description (une phrase), og:image (1200×630 px, moins de 5 Mo, URL https absolue). Ajoutez twitter:card="summary_large_image" pour obtenir une grande image sur X.'],
      ['Pourquoi les aperçus ne s’affichent pas', 'Des URL d’image relatives, des images bloquées par robots.txt, ou le cache de la plateforme qui garde une ancienne version (utilisez l’outil de débogage de chaque plateforme pour le rafraîchir).'],
    ],
    faq: [
      ['Les balises Open Graph améliorent-elles le SEO ?', 'Pas directement, mais des aperçus attrayants obtiennent plus de clics et de partages, ce qui apporte des visiteurs et des liens.'],
    ],
  },
  'image-alt-checker': {
    slug: 'verificateur-attribut-alt',
    name: 'Vérificateur d’attributs alt',
    h1: 'Vérificateur d’attributs alt et SEO des images',
    title: 'Vérificateur d’attributs alt : trouvez les alt manquants et les images trop lourdes',
    description: 'Listez chaque image d’une page avec son texte alternatif, son poids et son format. Trouvez les attributs alt manquants, les fichiers trop lourds et les risques de décalage (CLS). Gratuit.',
    intro: 'Cet outil liste les images d’une page, signale les textes alternatifs manquants (accessibilité et Google Images), mesure le poids des fichiers et repère les images sans largeur ni hauteur qui font sauter la mise en page.',
    sections: [
      ['Bien écrire un texte alternatif', 'Décrivez ce que montre l’image et pourquoi elle est là, en une phrase courte. « Artisan cousant un sac en cuir » vaut mieux que « image1.jpg » ou une liste de mots-clés. Les images purement décoratives doivent avoir alt="" pour que les lecteurs d’écran les ignorent.'],
      ['Le poids des images', 'Les images sont souvent la partie la plus lourde d’une page. Redimensionnez-les à leur taille d’affichage, convertissez-les en WebP ou AVIF et chargez en différé celles qui sont sous la ligne de flottaison.'],
    ],
    faq: [
      ['Un alt="" vide est-il une erreur ?', 'Non. C’est la bonne façon de marquer une image décorative. C’est l’absence de l’attribut alt qui pose problème.'],
    ],
  },
  'broken-link-checker': {
    slug: 'verificateur-liens-casses',
    name: 'Vérificateur de liens cassés',
    h1: 'Vérificateur de liens cassés',
    title: 'Vérificateur de liens cassés : trouvez les liens 404 et les chaînes de redirection',
    description: 'Analysez une page et les pages vers lesquelles elle pointe : liens cassés (404, 500), liens externes morts et chaînes de redirection. Vérification gratuite en ligne.',
    intro: 'Nous suivons les liens de votre page (et de quelques pages derrière elle), demandons chaque cible et signalons celles qui finissent en erreur, ainsi que les liens qui passent par plusieurs redirections.',
    sections: [
      ['Pourquoi les liens cassés font du tort', 'Chaque lien mort est un visiteur qui se heurte à un mur, et du temps d’exploration gaspillé pour les moteurs de recherche. Sur une page produit ou de contact, c’est du chiffre d’affaires perdu.'],
      ['Comment les corriger', 'Mettez à jour le lien vers la bonne URL, ou ajoutez une redirection permanente (301) de l’ancienne adresse vers la page vivante la plus proche. Évitez de tout rediriger vers la page d’accueil.'],
    ],
    faq: [
      ['Pourquoi un lien externe est-il jugé correct alors qu’il échoue dans mon navigateur ?', 'Certains sites bloquent les requêtes automatiques ou demandent une connexion. Nous ne signalons que les liens externes qui répondent clairement 404 ou 410, pour éviter les fausses alertes.'],
    ],
  },
  'website-speed-checker': {
    slug: 'test-vitesse-site',
    name: 'Test de vitesse de site',
    h1: 'Test de vitesse de site web',
    title: 'Test de vitesse de site : temps de réponse, poids de page et scripts bloquants',
    description: 'Mesurez le temps de réponse du serveur, le poids de la page, les images lourdes, la compression et les scripts bloquants de n’importe quelle page. Test gratuit avec corrections.',
    intro: 'Ce test mesure ce qui peut l’être précisément depuis un serveur : temps de réponse, poids de la page et de chaque ressource, compression, cache et scripts qui bloquent l’affichage. Quand c’est configuré, les Core Web Vitals viennent de Google PageSpeed Insights.',
    sections: [
      ['Ce qui ralentit la plupart des sites', 'Par ordre de fréquence : des images trop lourdes, un hébergement lent sans cache de page, trop de scripts tiers (widgets de chat, traceurs) et l’absence de compression.'],
      ['Mesure en labo et visiteurs réels', 'Un test unique est une photo prise depuis un seul endroit. Les données terrain des Core Web Vitals (issues de vrais utilisateurs de Chrome) sont la référence utilisée par Google pour le classement.'],
    ],
    faq: [
      ['Qu’est-ce qu’un bon temps de réponse serveur ?', 'Moins de 800 ms pour le premier octet est le seuil habituel ; moins de 200 ms est excellent.'],
    ],
  },
};

/** French slug -> English key. */
export const TOOL_BY_FR_SLUG = Object.fromEntries(Object.entries(TOOLS_FR).map(([en, t]) => [t.slug, en]));
