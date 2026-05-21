const mongoose = require('mongoose');

/**
 * Blog post — primary content surface for SEO.
 *
 * Every published post produces:
 *  - one indexable URL: /blog/<slug>
 *  - one Article + LearningResource JSON-LD block (emitted by SSR route)
 *  - one entry in /api/seo/sitemap.xml + /api/seo/sitemap-blog.xml
 *  - one OG image (per-post, never the generic site image)
 *
 * Design notes:
 *  - `slug` is the URL key. Lowercase, hyphenated, immutable after publish.
 *  - `seoTitle` / `seoDescription` are optional overrides for the <title>
 *    and meta description — when absent we fall back to title / excerpt.
 *  - `body` stores the rendered HTML (sanitized server-side on write).
 *    If we ever switch to MDX/Markdown, keep `bodyMarkdown` alongside.
 *  - `wordCount` + `readTime` are auto-computed on save for Article schema.
 *  - `relatedPosts` are slugs (not ObjectIds) so authors can hand-curate
 *    cluster pages without worrying about ID stability.
 */
const blogSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      match: [
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        'Slug must be lowercase, hyphen-separated alphanumerics',
      ],
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    excerpt: {
      type: String,
      trim: true,
      maxlength: 320,
      default: '',
    },
    body: {
      type: String,
      required: true,
    },
    bodyMarkdown: {
      type: String,
      default: '',
    },
    coverImage: {
      type: String,
      default: '',
    },
    coverImageAlt: {
      type: String,
      default: '',
      trim: true,
    },
    ogImage: {
      type: String,
      default: '',
    },
    category: {
      type: String,
      default: 'placement-prep',
      trim: true,
      lowercase: true,
      index: true,
    },
    tags: [
      {
        type: String,
        trim: true,
        lowercase: true,
      },
    ],
    author: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
      expertId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Expert',
        default: null,
      },
      name: { type: String, required: true, trim: true },
      avatar: { type: String, default: '' },
      bio: { type: String, default: '', maxlength: 500 },
      slug: { type: String, default: '', lowercase: true, trim: true },
    },
    seoTitle: {
      type: String,
      trim: true,
      maxlength: 70,
      default: '',
    },
    seoDescription: {
      type: String,
      trim: true,
      maxlength: 200,
      default: '',
    },
    seoKeywords: {
      type: [String],
      default: [],
    },
    canonicalUrl: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['draft', 'review', 'published', 'archived'],
      default: 'draft',
      index: true,
    },
    publishedAt: {
      type: Date,
      default: null,
      index: true,
    },
    wordCount: {
      type: Number,
      default: 0,
    },
    readTimeMinutes: {
      type: Number,
      default: 1,
    },
    viewCount: {
      type: Number,
      default: 0,
    },
    relatedPosts: [
      {
        type: String, // slug references
        trim: true,
      },
    ],
    // Optional structured FAQ block — rendered as FAQPage schema on the post
    faq: [
      {
        question: { type: String, required: true, trim: true },
        answer: { type: String, required: true, trim: true },
      },
    ],
  },
  { timestamps: true }
);

// Compound + text indexes for queries and search
blogSchema.index({ status: 1, publishedAt: -1 });
blogSchema.index({ status: 1, category: 1, publishedAt: -1 });
blogSchema.index({ tags: 1 });
blogSchema.index({
  title: 'text',
  excerpt: 'text',
  body: 'text',
  tags: 'text',
});

// Auto-compute wordCount + readTime + publishedAt on save
blogSchema.pre('save', function (next) {
  if (this.isModified('body') || this.isNew) {
    const text = String(this.body || '').replace(/<[^>]*>/g, ' ');
    const words = text.split(/\s+/).filter(Boolean).length;
    this.wordCount = words;
    this.readTimeMinutes = Math.max(1, Math.round(words / 220));
  }
  if (
    this.isModified('status') &&
    this.status === 'published' &&
    !this.publishedAt
  ) {
    this.publishedAt = new Date();
  }
  next();
});

// Helper for SSR / list view
blogSchema.methods.toPublic = function () {
  return {
    slug: this.slug,
    title: this.title,
    excerpt: this.excerpt,
    body: this.body,
    coverImage: this.coverImage,
    coverImageAlt: this.coverImageAlt,
    ogImage: this.ogImage || this.coverImage,
    category: this.category,
    tags: this.tags,
    author: this.author,
    seoTitle: this.seoTitle || this.title,
    seoDescription: this.seoDescription || this.excerpt,
    seoKeywords: this.seoKeywords,
    canonicalUrl:
      this.canonicalUrl || `https://sansal.in/blog/${this.slug}`,
    publishedAt: this.publishedAt,
    updatedAt: this.updatedAt,
    wordCount: this.wordCount,
    readTimeMinutes: this.readTimeMinutes,
    viewCount: this.viewCount,
    relatedPosts: this.relatedPosts,
    faq: this.faq,
  };
};

const Blog = mongoose.model('Blog', blogSchema);
module.exports = Blog;
