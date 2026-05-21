const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const SITE_URL = 'https://sansal.in';
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;

/**
 * Server-Side Rendering for crawler-critical detail pages.
 *
 * Why this exists:
 *   Sansal is an SPA. The dynamic sitemap lists /experts/<id>, /courses/<id>,
 *   /notes/view/<id>, and /blog/<slug> — but when Googlebot, Bingbot, or any
 *   social crawler fetches those URLs, the prerendered dist/ shell has no
 *   per-entity content. This route renders a full HTML page with the right
 *   <title>, meta tags, OG image, and JSON-LD for each entity.
 *
 * How it's used:
 *   vercel.json rewrites bot User-Agents on /experts/:id, /courses/:id,
 *   /notes/view/:id, /blog/:slug to:
 *     https://sansal-backend-xyzsandeepsansal.onrender.com/ssr/<entity>/<id>
 *
 *   Real users still hit the SPA. Crawlers get this server-rendered HTML.
 *   This is the "dynamic rendering" pattern Google explicitly endorses.
 *
 * Schema choices:
 *   /experts/:id    -> Person + AggregateRating + BreadcrumbList
 *   /courses/:id    -> Course + Offer + AggregateRating + BreadcrumbList
 *   /notes/view/:id -> Article + LearningResource + BreadcrumbList
 *   /blog/:slug     -> Article + (optional FAQPage) + BreadcrumbList
 */

// ---------- helpers ----------

const escapeHtml = (val = '') =>
  String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const truncate = (text, max = 160) => {
  if (!text) return '';
  const clean = String(text).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trimEnd() + '…';
};

const send404 = (res, message = 'Not Found') => {
  res.status(404).set('Content-Type', 'text/html; charset=utf-8').send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>404 — ${escapeHtml(message)} | Sansal</title>
<meta name="robots" content="noindex,follow" />
<link rel="canonical" href="${SITE_URL}/" />
</head><body><h1>${escapeHtml(message)}</h1>
<p><a href="${SITE_URL}/">Return to Sansal home</a></p></body></html>`);
};

/**
 * Build a complete HTML response.
 * Keeps this function deliberately framework-free — no React, no template
 * engine. Just a string builder. Crawlers care about the head; the body
 * carries the visible content for non-JS crawlers and link-preview bots.
 */
const renderPage = ({
  title,
  description,
  canonical,
  ogImage = DEFAULT_OG_IMAGE,
  ogImageAlt,
  ogType = 'website',
  bodyHtml,
  jsonLdBlocks = [],
  keywords = '',
}) => {
  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(description);
  const safeKeywords = escapeHtml(keywords);
  const safeOgAlt = escapeHtml(ogImageAlt || title);

  const ldScripts = jsonLdBlocks
    .map(
      (block) =>
        `<script type="application/ld+json">${JSON.stringify(block).replace(
          /</g,
          '\\u003c'
        )}</script>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en-IN" prefix="og: https://ogp.me/ns#">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${safeTitle}</title>
<meta name="description" content="${safeDesc}" />
${safeKeywords ? `<meta name="keywords" content="${safeKeywords}" />` : ''}
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
<link rel="canonical" href="${escapeHtml(canonical)}" />
<link rel="alternate" hreflang="en-IN" href="${escapeHtml(canonical)}" />
<link rel="alternate" hreflang="en" href="${escapeHtml(canonical)}" />
<link rel="alternate" hreflang="x-default" href="${escapeHtml(canonical)}" />

<meta property="og:type" content="${escapeHtml(ogType)}" />
<meta property="og:site_name" content="Sansal" />
<meta property="og:title" content="${safeTitle}" />
<meta property="og:description" content="${safeDesc}" />
<meta property="og:url" content="${escapeHtml(canonical)}" />
<meta property="og:image" content="${escapeHtml(ogImage)}" />
<meta property="og:image:secure_url" content="${escapeHtml(ogImage)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="${safeOgAlt}" />
<meta property="og:locale" content="en_IN" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="@sansal_ai" />
<meta name="twitter:title" content="${safeTitle}" />
<meta name="twitter:description" content="${safeDesc}" />
<meta name="twitter:image" content="${escapeHtml(ogImage)}" />

<link rel="icon" type="image/png" href="${SITE_URL}/logo.png" />

${ldScripts}
</head>
<body>
${bodyHtml}
<footer>
<p><a href="${SITE_URL}/">Sansal</a> · <a href="${SITE_URL}/interview/technical">AI Mock Interview</a> · <a href="${SITE_URL}/experts">Experts</a> · <a href="${SITE_URL}/courses">Courses</a> · <a href="${SITE_URL}/practice">Practice</a> · <a href="${SITE_URL}/notes">Notes</a> · <a href="${SITE_URL}/blog">Blog</a></p>
</footer>
</body>
</html>`;
};

const breadcrumb = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: it.name,
    item: it.url,
  })),
});

// ---------- /ssr/experts/:id ----------
router.get('/experts/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return send404(res);
    const Expert = mongoose.model('Expert');
    const expert = await Expert.findOne({
      _id: req.params.id,
      isActive: true,
      isVerified: true,
    }).lean();
    if (!expert) return send404(res, 'Expert not found');

    const canonical = `${SITE_URL}/experts/${expert._id}`;
    const title = `${expert.name} — ${expert.title || 'Expert Mentor'}${
      expert.company ? ` at ${expert.company}` : ''
    } | Sansal`;
    const desc = truncate(
      expert.bio ||
        `Book a 1-on-1 mentorship session with ${expert.name}, a verified industry expert on Sansal. ${
          expert.experience || 0
        }+ years experience${expert.company ? ` at ${expert.company}` : ''}.`
    );
    const skills = (expert.skills || []).slice(0, 8).join(', ');

    const personSchema = {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: expert.name,
      url: canonical,
      ...(expert.title ? { jobTitle: expert.title } : {}),
      ...(expert.company
        ? { worksFor: { '@type': 'Organization', name: expert.company } }
        : {}),
      ...(expert.avatar ? { image: expert.avatar } : {}),
      ...(expert.bio ? { description: truncate(expert.bio, 400) } : {}),
      ...(expert.skills && expert.skills.length
        ? { knowsAbout: expert.skills }
        : {}),
      ...(expert.socialLinks
        ? {
            sameAs: Object.values(expert.socialLinks).filter(Boolean),
          }
        : {}),
      ...(expert.rating && expert.rating.count > 0
        ? {
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: Number(expert.rating.average || 0).toFixed(1),
              reviewCount: expert.rating.count,
              bestRating: 5,
              worstRating: 1,
            },
          }
        : {}),
    };

    const offerSchema = expert.pricePerSession
      ? {
          '@context': 'https://schema.org',
          '@type': 'Service',
          name: `1-on-1 Mentorship Session with ${expert.name}`,
          provider: { '@type': 'Person', name: expert.name },
          areaServed: { '@type': 'Country', name: 'India' },
          offers: {
            '@type': 'Offer',
            price: expert.pricePerSession,
            priceCurrency: expert.currency || 'INR',
            availability: 'https://schema.org/InStock',
            url: canonical,
          },
        }
      : null;

    const crumbs = breadcrumb([
      { name: 'Home', url: `${SITE_URL}/` },
      { name: 'Experts', url: `${SITE_URL}/experts` },
      { name: expert.name, url: canonical },
    ]);

    const bodyHtml = `<main>
  <nav aria-label="Breadcrumb"><a href="${SITE_URL}/">Home</a> &rsaquo; <a href="${SITE_URL}/experts">Experts</a> &rsaquo; ${escapeHtml(
      expert.name
    )}</nav>
  <article>
    <header>
      ${expert.avatar ? `<img src="${escapeHtml(expert.avatar)}" alt="${escapeHtml(expert.name)}, mentor on Sansal" width="200" height="200" />` : ''}
      <h1>${escapeHtml(expert.name)}</h1>
      <p><strong>${escapeHtml(expert.title || 'Expert Mentor')}</strong>${
        expert.company ? ` at <strong>${escapeHtml(expert.company)}</strong>` : ''
      }</p>
      ${
        expert.experience
          ? `<p>${expert.experience}+ years of professional experience</p>`
          : ''
      }
      ${
        expert.rating && expert.rating.count > 0
          ? `<p>Rating: ${Number(expert.rating.average).toFixed(1)} / 5 from ${expert.rating.count} reviews</p>`
          : ''
      }
    </header>
    ${expert.bio ? `<section><h2>About</h2><p>${escapeHtml(expert.bio)}</p></section>` : ''}
    ${
      skills
        ? `<section><h2>Skills</h2><p>${escapeHtml(skills)}</p></section>`
        : ''
    }
    ${
      expert.pricePerSession
        ? `<section><h2>Mentorship Session</h2><p>${escapeHtml(
            expert.currency || 'INR'
          )} ${expert.pricePerSession} per ${expert.sessionDuration || 60}-minute session.</p>
        <p><a href="${SITE_URL}/experts/${expert._id}">Book a session with ${escapeHtml(expert.name)}</a></p></section>`
        : ''
    }
  </article>
</main>`;

    res.set('Cache-Control', 'public, max-age=600, s-maxage=3600');
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Last-Modified', new Date(expert.updatedAt || Date.now()).toUTCString());
    res.send(
      renderPage({
        title,
        description: desc,
        canonical,
        ogImage: expert.avatar || DEFAULT_OG_IMAGE,
        ogImageAlt: `${expert.name}, mentor on Sansal`,
        ogType: 'profile',
        bodyHtml,
        jsonLdBlocks: [crumbs, personSchema, ...(offerSchema ? [offerSchema] : [])],
        keywords: `${expert.name}, ${expert.title || ''}, expert mentor, placement mentor, ${skills}`,
      })
    );
  } catch (err) {
    console.error('[ssr/experts] error:', err);
    send404(res, 'Server error');
  }
});

// ---------- /ssr/courses/:id ----------
router.get('/courses/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return send404(res);
    const Course = mongoose.model('Course');
    const course = await Course.findOne({
      _id: req.params.id,
      isPublished: true,
      isActive: true,
    })
      .populate('expertId', 'name title company avatar')
      .lean();
    if (!course) return send404(res, 'Course not found');

    const canonical = `${SITE_URL}/courses/${course._id}`;
    const instructor = course.expertId;
    const title = `${course.title} | Free Online Course | Sansal`;
    const desc = truncate(
      course.description || course.subtitle || `Learn ${course.title} on Sansal.`
    );

    const courseSchema = {
      '@context': 'https://schema.org',
      '@type': 'Course',
      name: course.title,
      description: truncate(course.description || course.subtitle, 400),
      url: canonical,
      provider: {
        '@type': 'Organization',
        name: 'Sansal',
        sameAs: SITE_URL,
      },
      ...(course.thumbnail ? { image: course.thumbnail } : {}),
      ...(instructor
        ? {
            instructor: {
              '@type': 'Person',
              name: instructor.name,
              ...(instructor.title ? { jobTitle: instructor.title } : {}),
              ...(instructor.company
                ? {
                    worksFor: {
                      '@type': 'Organization',
                      name: instructor.company,
                    },
                  }
                : {}),
            },
          }
        : {}),
      ...(course.tags && course.tags.length
        ? { keywords: course.tags.join(', ') }
        : {}),
      hasCourseInstance: [
        {
          '@type': 'CourseInstance',
          courseMode: course.mode === 'live' ? 'OnSite' : 'Online',
          inLanguage: course.language || 'en',
          ...(course.totalLectures
            ? {
                courseWorkload: `PT${Math.max(
                  1,
                  Math.round((course.totalLectures || 0) * 0.5)
                )}H`,
              }
            : {}),
        },
      ],
      offers: {
        '@type': 'Offer',
        price: course.price || 0,
        priceCurrency: course.currency || 'INR',
        category: course.price > 0 ? 'Paid' : 'Free',
        availability: 'https://schema.org/InStock',
        url: canonical,
      },
      ...(course.ratingCount > 0
        ? {
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: Number(course.ratingAverage || 0).toFixed(1),
              reviewCount: course.ratingCount,
              bestRating: 5,
              worstRating: 1,
            },
          }
        : {}),
      educationalCredentialAwarded: 'Certificate of Completion',
    };

    const crumbs = breadcrumb([
      { name: 'Home', url: `${SITE_URL}/` },
      { name: 'Courses', url: `${SITE_URL}/courses` },
      { name: course.title, url: canonical },
    ]);

    const bodyHtml = `<main>
  <nav aria-label="Breadcrumb"><a href="${SITE_URL}/">Home</a> &rsaquo; <a href="${SITE_URL}/courses">Courses</a> &rsaquo; ${escapeHtml(
      course.title
    )}</nav>
  <article>
    <header>
      ${course.thumbnail ? `<img src="${escapeHtml(course.thumbnail)}" alt="${escapeHtml(course.title)} cover" width="800" height="450" />` : ''}
      <h1>${escapeHtml(course.title)}</h1>
      ${course.subtitle ? `<p>${escapeHtml(course.subtitle)}</p>` : ''}
      <p><strong>Level:</strong> ${escapeHtml(course.level || 'all')} · <strong>Mode:</strong> ${escapeHtml(course.mode || 'recorded')} · <strong>Language:</strong> ${escapeHtml(course.language || 'English')}</p>
      <p><strong>Price:</strong> ${course.price > 0 ? `${escapeHtml(course.currency || 'INR')} ${course.price}` : 'Free'}</p>
      ${
        course.ratingCount > 0
          ? `<p>Rating: ${Number(course.ratingAverage).toFixed(1)} / 5 from ${course.ratingCount} reviews</p>`
          : ''
      }
      ${
        instructor
          ? `<p>Instructor: <strong>${escapeHtml(instructor.name)}</strong>${instructor.company ? ` (${escapeHtml(instructor.company)})` : ''}</p>`
          : ''
      }
    </header>
    ${course.description ? `<section><h2>About this course</h2><p>${escapeHtml(course.description)}</p></section>` : ''}
    ${
      course.learningOutcomes && course.learningOutcomes.length
        ? `<section><h2>What you'll learn</h2><ul>${course.learningOutcomes
            .map((l) => `<li>${escapeHtml(l)}</li>`)
            .join('')}</ul></section>`
        : ''
    }
    <p><a href="${canonical}">Enroll in ${escapeHtml(course.title)}</a></p>
  </article>
</main>`;

    res.set('Cache-Control', 'public, max-age=600, s-maxage=3600');
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Last-Modified', new Date(course.updatedAt || Date.now()).toUTCString());
    res.send(
      renderPage({
        title,
        description: desc,
        canonical,
        ogImage: course.thumbnail || DEFAULT_OG_IMAGE,
        ogImageAlt: `${course.title} on Sansal`,
        ogType: 'website',
        bodyHtml,
        jsonLdBlocks: [crumbs, courseSchema],
        keywords: (course.tags || []).slice(0, 8).join(', '),
      })
    );
  } catch (err) {
    console.error('[ssr/courses] error:', err);
    send404(res, 'Server error');
  }
});

// ---------- /ssr/notes/view/:id ----------
router.get('/notes/view/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return send404(res);
    const Note = mongoose.model('Note');
    const note = await Note.findOne({
      _id: req.params.id,
      visibility: 'public',
    }).lean();
    if (!note) return send404(res, 'Note not found');

    const canonical = `${SITE_URL}/notes/view/${note._id}`;
    const title = `${note.title}${note.subject ? ` — ${note.subject}` : ''} | Free Study Notes | Sansal`;
    const desc = truncate(
      note.description ||
        `Free verified study notes for ${note.subject || 'engineering students'}${
          note.semester ? `, ${note.semester}` : ''
        }${note.domain ? `, ${note.domain}` : ''}.`
    );

    const articleSchema = {
      '@context': 'https://schema.org',
      '@type': ['Article', 'LearningResource'],
      headline: note.title,
      description: truncate(note.description, 320),
      url: canonical,
      datePublished: note.createdAt
        ? new Date(note.createdAt).toISOString()
        : undefined,
      dateModified: note.updatedAt
        ? new Date(note.updatedAt).toISOString()
        : undefined,
      author: {
        '@type': note.uploader?.role === 'expert' ? 'Person' : 'Person',
        name: note.uploader?.name || 'Sansal Community',
      },
      publisher: {
        '@type': 'Organization',
        name: 'Sansal',
        logo: {
          '@type': 'ImageObject',
          url: `${SITE_URL}/logo.png`,
        },
      },
      educationalLevel: 'undergraduate',
      learningResourceType: 'Lecture notes',
      ...(note.subject ? { about: note.subject } : {}),
      ...(note.tags && note.tags.length ? { keywords: note.tags.join(', ') } : {}),
      inLanguage: 'en',
    };

    const crumbs = breadcrumb([
      { name: 'Home', url: `${SITE_URL}/` },
      { name: 'Notes', url: `${SITE_URL}/notes` },
      { name: note.title, url: canonical },
    ]);

    const bodyHtml = `<main>
  <nav aria-label="Breadcrumb"><a href="${SITE_URL}/">Home</a> &rsaquo; <a href="${SITE_URL}/notes">Notes</a> &rsaquo; ${escapeHtml(
      note.title
    )}</nav>
  <article>
    <header>
      <h1>${escapeHtml(note.title)}</h1>
      <p>
        ${note.subject ? `<strong>Subject:</strong> ${escapeHtml(note.subject)}` : ''}
        ${note.semester ? ` · <strong>Semester:</strong> ${escapeHtml(note.semester)}` : ''}
        ${note.domain ? ` · <strong>Domain:</strong> ${escapeHtml(note.domain)}` : ''}
      </p>
      ${note.uploader?.name ? `<p>Uploaded by ${escapeHtml(note.uploader.name)}</p>` : ''}
    </header>
    ${note.description ? `<section><h2>Description</h2><p>${escapeHtml(note.description)}</p></section>` : ''}
    ${
      note.tags && note.tags.length
        ? `<section><h2>Tags</h2><p>${note.tags.map((t) => escapeHtml(t)).join(', ')}</p></section>`
        : ''
    }
    <p><a href="${canonical}">Open this note on Sansal</a></p>
  </article>
</main>`;

    res.set('Cache-Control', 'public, max-age=600, s-maxage=3600');
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Last-Modified', new Date(note.updatedAt || Date.now()).toUTCString());
    res.send(
      renderPage({
        title,
        description: desc,
        canonical,
        ogImageAlt: `${note.title} — Sansal study notes`,
        ogType: 'article',
        bodyHtml,
        jsonLdBlocks: [crumbs, articleSchema],
        keywords: (note.tags || []).slice(0, 8).join(', '),
      })
    );
  } catch (err) {
    console.error('[ssr/notes] error:', err);
    send404(res, 'Server error');
  }
});

// ---------- /ssr/blog/:slug ----------
router.get('/blog/:slug', async (req, res) => {
  try {
    const Blog = mongoose.model('Blog');
    const post = await Blog.findOne({
      slug: req.params.slug,
      status: 'published',
    }).lean();
    if (!post) return send404(res, 'Blog post not found');

    const canonical = post.canonicalUrl || `${SITE_URL}/blog/${post.slug}`;
    const title = post.seoTitle || `${post.title} | Sansal Blog`;
    const desc = truncate(post.seoDescription || post.excerpt || post.body, 200);

    const articleSchema = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.title,
      description: truncate(post.excerpt || post.body, 320),
      url: canonical,
      mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
      ...(post.coverImage
        ? {
            image: {
              '@type': 'ImageObject',
              url: post.coverImage,
              width: 1200,
              height: 630,
            },
          }
        : {}),
      datePublished: post.publishedAt
        ? new Date(post.publishedAt).toISOString()
        : undefined,
      dateModified: post.updatedAt
        ? new Date(post.updatedAt).toISOString()
        : undefined,
      author: {
        '@type': 'Person',
        name: post.author?.name || 'Sansal Editorial',
        ...(post.author?.slug
          ? { url: `${SITE_URL}/authors/${post.author.slug}` }
          : {}),
      },
      publisher: {
        '@type': 'Organization',
        name: 'Sansal',
        logo: {
          '@type': 'ImageObject',
          url: `${SITE_URL}/logo.png`,
        },
      },
      ...(post.wordCount ? { wordCount: post.wordCount } : {}),
      ...(post.tags && post.tags.length ? { keywords: post.tags.join(', ') } : {}),
      articleSection: post.category || 'Placement Preparation',
      inLanguage: 'en-IN',
    };

    const faqSchema =
      post.faq && post.faq.length
        ? {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: post.faq.map((q) => ({
              '@type': 'Question',
              name: q.question,
              acceptedAnswer: {
                '@type': 'Answer',
                text: q.answer,
              },
            })),
          }
        : null;

    const crumbs = breadcrumb([
      { name: 'Home', url: `${SITE_URL}/` },
      { name: 'Blog', url: `${SITE_URL}/blog` },
      { name: post.title, url: canonical },
    ]);

    const bodyHtml = `<main>
  <nav aria-label="Breadcrumb"><a href="${SITE_URL}/">Home</a> &rsaquo; <a href="${SITE_URL}/blog">Blog</a> &rsaquo; ${escapeHtml(
      post.title
    )}</nav>
  <article>
    <header>
      ${post.coverImage ? `<img src="${escapeHtml(post.coverImage)}" alt="${escapeHtml(post.coverImageAlt || post.title)}" width="1200" height="630" />` : ''}
      <h1>${escapeHtml(post.title)}</h1>
      <p>By <strong>${escapeHtml(post.author?.name || 'Sansal Editorial')}</strong>${
        post.publishedAt
          ? ` · Published <time datetime="${new Date(post.publishedAt).toISOString()}">${new Date(post.publishedAt).toDateString()}</time>`
          : ''
      } · ${post.readTimeMinutes || 1} min read</p>
      ${post.excerpt ? `<p>${escapeHtml(post.excerpt)}</p>` : ''}
    </header>
    <section>${post.body || ''}</section>
    ${
      post.faq && post.faq.length
        ? `<section><h2>FAQ</h2>${post.faq
            .map(
              (q) =>
                `<details><summary>${escapeHtml(q.question)}</summary><p>${escapeHtml(q.answer)}</p></details>`
            )
            .join('')}</section>`
        : ''
    }
  </article>
</main>`;

    res.set('Cache-Control', 'public, max-age=600, s-maxage=3600');
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set(
      'Last-Modified',
      new Date(post.updatedAt || post.publishedAt || Date.now()).toUTCString()
    );
    res.send(
      renderPage({
        title,
        description: desc,
        canonical,
        ogImage: post.ogImage || post.coverImage || DEFAULT_OG_IMAGE,
        ogImageAlt: post.coverImageAlt || post.title,
        ogType: 'article',
        bodyHtml,
        jsonLdBlocks: [crumbs, articleSchema, ...(faqSchema ? [faqSchema] : [])],
        keywords:
          (post.seoKeywords && post.seoKeywords.join(', ')) ||
          (post.tags || []).slice(0, 8).join(', '),
      })
    );
  } catch (err) {
    console.error('[ssr/blog] error:', err);
    send404(res, 'Server error');
  }
});

module.exports = router;
