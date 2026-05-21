const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const SITE_URL = 'https://sansal.in';

// ---------------------------------------------------------------
// Static marketing + product routes
// ---------------------------------------------------------------
const STATIC_ROUTES = [
  { path: '/', changefreq: 'daily', priority: 1.0 },
  { path: '/interview/technical', changefreq: 'weekly', priority: 0.95 },
  { path: '/experts', changefreq: 'daily', priority: 0.90 },
  { path: '/courses', changefreq: 'weekly', priority: 0.85 },
  { path: '/practice', changefreq: 'weekly', priority: 0.90 },
  { path: '/notes', changefreq: 'daily', priority: 0.85 },
  { path: '/about', changefreq: 'monthly', priority: 0.70 },
  { path: '/faqs', changefreq: 'monthly', priority: 0.75 },
  { path: '/contact', changefreq: 'monthly', priority: 0.65 },
  { path: '/help', changefreq: 'monthly', priority: 0.65 },
  { path: '/community', changefreq: 'weekly', priority: 0.60 },
  { path: '/bookings', changefreq: 'weekly', priority: 0.60 },
  { path: '/blog', changefreq: 'daily', priority: 0.90 },
  { path: '/tools', changefreq: 'weekly', priority: 0.75 },
  { path: '/interview-questions', changefreq: 'weekly', priority: 0.85 },
  { path: '/aptitude', changefreq: 'weekly', priority: 0.85 },
  { path: '/colleges', changefreq: 'weekly', priority: 0.75 },
  { path: '/authors', changefreq: 'monthly', priority: 0.60 },
  { path: '/privacy-policy', changefreq: 'yearly', priority: 0.40 },
  { path: '/terms-of-service', changefreq: 'yearly', priority: 0.40 },
];

const escapeXml = (val = '') =>
  String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const todayIso = () => new Date().toISOString().split('T')[0];
const isoDate = (d) => (d ? new Date(d).toISOString().split('T')[0] : todayIso());

const buildExpertUrls = async () => {
  try {
    const Expert = mongoose.model('Expert');
    // BUGFIX: prior code queried isApproved (field does not exist on the
    // Expert model). The canonical "show this expert publicly" combination
    // is isVerified + isActive, which matches expertSchema.index().
    const experts = await Expert.find(
      { isVerified: true, isActive: true },
      { _id: 1, updatedAt: 1, name: 1 }
    ).lean();
    return experts.map((e) => ({
      path: `/experts/${e._id}`,
      lastmod: isoDate(e.updatedAt),
      changefreq: 'weekly',
      priority: 0.80,
    }));
  } catch (err) {
    console.warn('[seo/sitemap] Expert query failed:', err.message);
    return [];
  }
};

const buildCourseUrls = async () => {
  try {
    const Course = mongoose.model('Course');
    // BUGFIX: prior code queried `status: { $in: ['published', 'active'] }`.
    // The actual model uses isPublished + isActive booleans.
    const courses = await Course.find(
      { isPublished: true, isActive: true },
      { _id: 1, updatedAt: 1, title: 1 }
    ).lean();
    return courses.map((c) => ({
      path: `/courses/${c._id}`,
      lastmod: isoDate(c.updatedAt),
      changefreq: 'weekly',
      priority: 0.80,
    }));
  } catch (err) {
    console.warn('[seo/sitemap] Course query failed:', err.message);
    return [];
  }
};

const buildNoteUrls = async () => {
  try {
    const Note = mongoose.model('Note');
    // BUGFIX: prior code queried `isVerified: true`. The Note model has
    // no such field — it has `visibility: 'public' | 'private'`.
    const notes = await Note.find(
      { visibility: 'public' },
      { _id: 1, updatedAt: 1, title: 1 }
    ).lean();
    return notes.map((n) => ({
      path: `/notes/view/${n._id}`,
      lastmod: isoDate(n.updatedAt),
      changefreq: 'monthly',
      priority: 0.65,
    }));
  } catch (err) {
    console.warn('[seo/sitemap] Note query failed:', err.message);
    return [];
  }
};

const buildBlogUrls = async () => {
  try {
    const Blog = mongoose.model('Blog');
    const blogs = await Blog.find(
      { status: 'published' },
      { slug: 1, updatedAt: 1, publishedAt: 1, title: 1, coverImage: 1 }
    )
      .sort({ publishedAt: -1 })
      .lean();
    return blogs.map((b) => ({
      path: `/blog/${b.slug}`,
      lastmod: isoDate(b.updatedAt || b.publishedAt),
      changefreq: 'monthly',
      priority: 0.75,
      image: b.coverImage || null,
      title: b.title || null,
    }));
  } catch (err) {
    // Blog model may not be registered in older deployments — log and continue.
    console.warn('[seo/sitemap] Blog query failed (model may not exist yet):', err.message);
    return [];
  }
};

const buildXmlEntry = (u) => {
  const base = `  <url>
    <loc>${escapeXml(SITE_URL + u.path)}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority.toFixed(2)}</priority>`;
  const image = u.image
    ? `\n    <image:image>
      <image:loc>${escapeXml(u.image)}</image:loc>${
        u.title ? `\n      <image:title>${escapeXml(u.title)}</image:title>` : ''
      }
    </image:image>`
    : '';
  return `${base}${image}\n  </url>`;
};

/**
 * GET /api/seo/sitemap.xml
 * Dynamic sitemap including expert profiles, courses, notes, and blog posts.
 *
 * Cache strategy: 1h CDN cache. We refresh aggressively because this is the
 * primary discovery surface for Google. Each model query is independently
 * try/catched so an empty collection or unregistered model never 500s.
 */
router.get('/sitemap.xml', async (req, res) => {
  try {
    const today = todayIso();

    const [expertUrls, courseUrls, noteUrls, blogUrls] = await Promise.all([
      buildExpertUrls(),
      buildCourseUrls(),
      buildNoteUrls(),
      buildBlogUrls(),
    ]);

    const allUrls = [
      ...STATIC_ROUTES.map((r) => ({ ...r, lastmod: today })),
      ...expertUrls,
      ...courseUrls,
      ...noteUrls,
      ...blogUrls,
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${allUrls.map(buildXmlEntry).join('\n')}
</urlset>`;

    res.set('Content-Type', 'application/xml');
    res.set('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    res.send(xml);
  } catch (error) {
    console.error('[seo/sitemap] Generation error:', error);
    res
      .status(500)
      .send(
        '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>'
      );
  }
});

/**
 * GET /api/seo/sitemap-blog.xml
 * Blog-only sitemap. Useful for Google News + faster blog reindexing.
 */
router.get('/sitemap-blog.xml', async (req, res) => {
  try {
    const blogUrls = await buildBlogUrls();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${blogUrls.map(buildXmlEntry).join('\n')}
</urlset>`;
    res.set('Content-Type', 'application/xml');
    res.set('Cache-Control', 'public, max-age=1800, s-maxage=1800');
    res.send(xml);
  } catch (error) {
    console.error('[seo/sitemap-blog] Generation error:', error);
    res
      .status(500)
      .send(
        '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>'
      );
  }
});

/**
 * GET /api/seo/robots.txt
 * Dynamic robots.txt (mirror of /public/robots.txt) so it can be served
 * directly from the API host if the static file is unreachable.
 */
router.get('/robots.txt', (req, res) => {
  const robotsTxt = `# Sansal - AI Mock Interview & Placement Preparation Platform
# https://sansal.in

User-agent: *
Allow: /
Allow: /interview/technical
Allow: /experts
Allow: /experts/
Allow: /courses
Allow: /courses/
Allow: /practice
Allow: /notes
Allow: /notes/view/
Allow: /about
Allow: /faqs
Allow: /contact
Allow: /help
Allow: /community
Allow: /bookings
Allow: /blog
Allow: /blog/
Allow: /authors/
Allow: /tools/
Allow: /interview-questions/
Allow: /aptitude/
Allow: /colleges/
Disallow: /admin/
Disallow: /private/
Disallow: /api/
Disallow: /login
Disallow: /signup
Disallow: /verify-otp
Disallow: /forgot-password
Disallow: /dashboard/
Disallow: /profile
Disallow: /settings
Disallow: /interview
Disallow: /results
Disallow: /bookings/
Disallow: /chat
Disallow: /chat/
Disallow: /expert/become-expert
Disallow: /*?utm_*
Disallow: /*?ref=*
Disallow: /*?fbclid=*
Disallow: /*?gclid=*
Crawl-delay: 1

User-agent: Googlebot
Allow: /
Disallow: /dashboard/
Disallow: /login
Disallow: /signup
Disallow: /interview
Disallow: /results
Disallow: /chat

User-agent: Googlebot-Image
Allow: /
Allow: /logo.png
Allow: /og-image.png

User-agent: AdsBot-Google
Allow: /

User-agent: Bingbot
Allow: /
Disallow: /dashboard/
Disallow: /login
Disallow: /signup
Disallow: /interview
Disallow: /results
Disallow: /chat

# AI search crawlers
User-agent: GPTBot
Allow: /
Disallow: /dashboard/
Disallow: /interview
Disallow: /results
Disallow: /chat

User-agent: ChatGPT-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Applebot
Allow: /

# Social-media link previews
User-agent: facebookexternalhit
Allow: /

User-agent: Twitterbot
Allow: /

User-agent: LinkedInBot
Allow: /

User-agent: WhatsApp
Allow: /

User-agent: Slackbot
Allow: /

User-agent: AhrefsBot
Crawl-delay: 10

User-agent: SemrushBot
Crawl-delay: 10

User-agent: MJ12bot
Disallow: /

Sitemap: ${SITE_URL}/sitemap.xml
Sitemap: ${SITE_URL}/api/seo/sitemap.xml
Sitemap: ${SITE_URL}/api/seo/sitemap-blog.xml

Host: ${SITE_URL}
`;

  res.set('Content-Type', 'text/plain');
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(robotsTxt);
});

module.exports = router;
