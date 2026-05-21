const express = require('express');
const router = express.Router();
const Blog = require('../models/Blog');
const { authMiddleware, adminMiddleware } = require('../middleware/authMiddleware');

/**
 * Blog API
 *
 * Public:
 *   GET  /api/blogs                       - paginated list
 *   GET  /api/blogs/categories            - distinct category list
 *   GET  /api/blogs/tags                  - top tags
 *   GET  /api/blogs/related/:slug         - related posts (cluster siblings)
 *   GET  /api/blogs/:slug                 - single post by slug
 *   POST /api/blogs/:slug/view            - increment view count
 *
 * Admin (auth + adminMiddleware):
 *   POST   /api/blogs                     - create
 *   PUT    /api/blogs/:slug               - update
 *   DELETE /api/blogs/:slug               - delete
 */

// ---- Public list ----
router.get('/', async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 50);
    const skip = (page - 1) * limit;

    const filter = { status: 'published' };
    if (req.query.category) filter.category = String(req.query.category).toLowerCase();
    if (req.query.tag) filter.tags = String(req.query.tag).toLowerCase();
    if (req.query.q) {
      filter.$text = { $search: String(req.query.q) };
    }

    const projection = {
      slug: 1,
      title: 1,
      excerpt: 1,
      coverImage: 1,
      coverImageAlt: 1,
      category: 1,
      tags: 1,
      author: 1,
      publishedAt: 1,
      readTimeMinutes: 1,
      viewCount: 1,
    };

    const [items, total] = await Promise.all([
      Blog.find(filter, projection)
        .sort({ publishedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Blog.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('[blogs] list error:', error);
    res.status(500).json({ success: false, error: 'Failed to load blogs' });
  }
});

// ---- Distinct categories (for nav / filter UI) ----
router.get('/categories', async (req, res) => {
  try {
    const categories = await Blog.distinct('category', { status: 'published' });
    res.json({ success: true, data: categories.filter(Boolean).sort() });
  } catch (error) {
    console.error('[blogs] categories error:', error);
    res.status(500).json({ success: false, error: 'Failed to load categories' });
  }
});

// ---- Top tags (cap at 50) ----
router.get('/tags', async (req, res) => {
  try {
    const result = await Blog.aggregate([
      { $match: { status: 'published' } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 50 },
      { $project: { _id: 0, tag: '$_id', count: 1 } },
    ]);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[blogs] tags error:', error);
    res.status(500).json({ success: false, error: 'Failed to load tags' });
  }
});

// ---- Related posts ----
router.get('/related/:slug', async (req, res) => {
  try {
    const post = await Blog.findOne(
      { slug: req.params.slug, status: 'published' },
      { tags: 1, category: 1, relatedPosts: 1 }
    ).lean();
    if (!post) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }

    // 1) explicit hand-picked related posts win
    let related = [];
    if (post.relatedPosts && post.relatedPosts.length) {
      related = await Blog.find(
        { slug: { $in: post.relatedPosts }, status: 'published' },
        { slug: 1, title: 1, excerpt: 1, coverImage: 1, publishedAt: 1, readTimeMinutes: 1 }
      ).lean();
    }

    // 2) backfill with same-category / overlapping-tag posts
    if (related.length < 4) {
      const more = await Blog.find(
        {
          status: 'published',
          slug: { $ne: req.params.slug, $nin: post.relatedPosts || [] },
          $or: [
            { category: post.category },
            { tags: { $in: post.tags || [] } },
          ],
        },
        { slug: 1, title: 1, excerpt: 1, coverImage: 1, publishedAt: 1, readTimeMinutes: 1 }
      )
        .sort({ publishedAt: -1 })
        .limit(4 - related.length)
        .lean();
      related = [...related, ...more];
    }

    res.json({ success: true, data: related });
  } catch (error) {
    console.error('[blogs] related error:', error);
    res.status(500).json({ success: false, error: 'Failed to load related' });
  }
});

// ---- Single post by slug ----
router.get('/:slug', async (req, res) => {
  try {
    const post = await Blog.findOne({
      slug: req.params.slug,
      status: 'published',
    });
    if (!post) {
      return res.status(404).json({ success: false, error: 'Blog not found' });
    }
    res.json({ success: true, data: post.toPublic() });
  } catch (error) {
    console.error('[blogs] detail error:', error);
    res.status(500).json({ success: false, error: 'Failed to load blog' });
  }
});

// ---- View counter ----
router.post('/:slug/view', async (req, res) => {
  try {
    await Blog.updateOne(
      { slug: req.params.slug, status: 'published' },
      { $inc: { viewCount: 1 } }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to record view' });
  }
});

// ---- Admin: create ----
router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const blog = await Blog.create(req.body);
    res.status(201).json({ success: true, data: blog.toPublic() });
  } catch (error) {
    console.error('[blogs] create error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ---- Admin: update ----
router.put('/:slug', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const blog = await Blog.findOneAndUpdate(
      { slug: req.params.slug },
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!blog) {
      return res.status(404).json({ success: false, error: 'Blog not found' });
    }
    res.json({ success: true, data: blog.toPublic() });
  } catch (error) {
    console.error('[blogs] update error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ---- Admin: delete ----
router.delete('/:slug', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await Blog.findOneAndDelete({ slug: req.params.slug });
    if (!result) {
      return res.status(404).json({ success: false, error: 'Blog not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('[blogs] delete error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete' });
  }
});

module.exports = router;
