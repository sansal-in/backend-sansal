const Note = require('../models/Note');
const cloudinary = require('../config/cloudinary');
const axios = require('axios');

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseTags = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((tag) => `${tag}`.trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  return [];
};

const getUploaderRole = (user) => {
  if (!user || !user.role) return 'student';
  if (user.role.includes('admin')) return 'admin';
  if (user.role.includes('expert')) return 'expert';
  return 'student';
};

const inferResourceTypeFromMime = (mimeType = '') => {
  if (mimeType === 'application/pdf' || mimeType.startsWith('image/')) {
    return 'image';
  }
  return 'raw';
};

const resolveCloudinaryResourceType = (note) => {
  if (note?.fileResourceType) return note.fileResourceType;
  return inferResourceTypeFromMime(note?.fileType || '');
};

const fetchCloudinaryResourceUrl = async (note) => {
  if (!note?.filePublicId) return null;
  const primaryType = resolveCloudinaryResourceType(note);

  const tryFetch = async (resourceType) => {
    const result = await cloudinary.api.resource(note.filePublicId, {
      resource_type: resourceType
    });
    return { secureUrl: result.secure_url, resourceType };
  };

  try {
    return await tryFetch(primaryType);
  } catch (error) {
    const httpCode = error?.http_code || error?.error?.http_code;
    if (httpCode === 404) {
      const fallbackType = primaryType === 'raw' ? 'image' : 'raw';
      return await tryFetch(fallbackType);
    }
    throw error;
  }
};

// List notes with filters
const listNotes = async (req, res) => {
  try {
    const { q, category, subject, semester, year, domain, track, technology, tag, uploader, sort } = req.query;
    const filter = { visibility: 'public' };

    if (category) {
      filter.category = new RegExp(`^${escapeRegex(category)}$`, 'i');
    }

    if (subject) {
      filter.subject = new RegExp(`^${escapeRegex(subject)}$`, 'i');
    }

    if (semester) {
      filter.semester = new RegExp(`^${escapeRegex(semester)}$`, 'i');
    }

    if (year) {
      filter.year = new RegExp(`^${escapeRegex(year)}$`, 'i');
    }

    if (domain) {
      filter.domain = new RegExp(`^${escapeRegex(domain)}$`, 'i');
    }

    if (track) {
      filter.track = new RegExp(`^${escapeRegex(track)}$`, 'i');
    }

    if (technology) {
      filter.technology = new RegExp(`^${escapeRegex(technology)}$`, 'i');
    }

    if (tag) {
      filter.tags = { $in: [tag] };
    }

    if (uploader) {
      filter['uploader.role'] = uploader;
    }

    if (q) {
      const query = escapeRegex(q);
      filter.$or = [
        { title: new RegExp(query, 'i') },
        { description: new RegExp(query, 'i') },
        { subject: new RegExp(query, 'i') },
        { category: new RegExp(query, 'i') },
        { semester: new RegExp(query, 'i') },
        { year: new RegExp(query, 'i') },
        { domain: new RegExp(query, 'i') },
        { track: new RegExp(query, 'i') },
        { technology: new RegExp(query, 'i') },
        { tags: new RegExp(query, 'i') }
      ];
    }

    const sortMap = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      title: { title: 1 }
    };
    const sortBy = sortMap[sort] || sortMap.newest;

    const notes = await Note.find(filter).sort(sortBy).limit(300);

    res.status(200).json({
      success: true,
      data: notes
    });
  } catch (error) {
    console.error('List notes error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notes'
    });
  }
};

// Get single note by ID (metadata only)
const getNoteById = async (req, res) => {
  try {
    const { noteId } = req.params;
    
    const note = await Note.findById(noteId);
    
    if (!note) {
      return res.status(404).json({
        success: false,
        error: 'Note not found'
      });
    }

    // Check visibility
    if (note.visibility !== 'public') {
      // Check if user has permission to view private notes
      if (!req.user || (note.uploader.id && note.uploader.id.toString() !== req.user._id?.toString())) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to view this note'
        });
      }
    }

    res.status(200).json({
      success: true,
      data: {
        _id: note._id,
        title: note.title,
        description: note.description,
        category: note.category,
        subject: note.subject,
        semester: note.semester,
        year: note.year,
        domain: note.domain,
        track: note.track,
        technology: note.technology,
        tags: note.tags,
        fileName: note.fileName,
        fileSize: note.fileSize,
        fileType: note.fileType,
        uploader: note.uploader,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt
      }
    });
  } catch (error) {
    console.error('Get note error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch note'
    });
  }
};

// Get note content (PDF) - for viewing
const getNoteContent = async (req, res) => {
  try {
    const { noteId } = req.params;
    
    const note = await Note.findById(noteId);
    
    if (!note) {
      return res.status(404).json({
        success: false,
        error: 'Note not found'
      });
    }

    // Check visibility
    if (note.visibility !== 'public') {
      if (!req.user || (note.uploader.id && note.uploader.id.toString() !== req.user._id?.toString())) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to view this note'
        });
      }
    }

    // Fetch file content
    let fileBuffer;
    let fileContent;

    try {
      const directResponse = await axios.get(note.fileUrl, {
        responseType: 'arraybuffer'
      });
      fileBuffer = directResponse.data;
    } catch (downloadError) {
      try {
        const result = await fetchCloudinaryResourceUrl(note);
        if (!result?.secureUrl) {
          throw downloadError;
        }

        const response = await axios.get(result.secureUrl, {
          responseType: 'arraybuffer'
        });
        fileBuffer = response.data;

        if (result.resourceType && result.resourceType !== note.fileResourceType) {
          note.fileResourceType = result.resourceType;
          note.save().catch(() => {});
        }
      } catch (error) {
        console.error('Error fetching from Cloudinary:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch file content'
        });
      }
    }

    fileContent = Buffer.from(fileBuffer).toString('base64');

    res.status(200).json({
      success: true,
      data: {
        content: fileContent,
        fileName: note.fileName,
        fileSize: note.fileSize,
        fileType: note.fileType
      }
    });
    
  } catch (error) {
    console.error('Get note content error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch note content'
    });
  }
};

// Download note (triggers file download)
const downloadNote = async (req, res) => {
  try {
    const { noteId } = req.params;
    
    const note = await Note.findById(noteId);
    
    if (!note) {
      return res.status(404).json({
        success: false,
        error: 'Note not found'
      });
    }

    // Check visibility
    if (note.visibility !== 'public') {
      if (!req.user || (note.uploader.id && note.uploader.id.toString() !== req.user._id?.toString())) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to download this note'
        });
      }
    }

    // Fetch file content
    let fileBuffer;
    let fileContent;

    try {
      const directResponse = await axios.get(note.fileUrl, {
        responseType: 'arraybuffer'
      });
      fileBuffer = directResponse.data;
    } catch (downloadError) {
      try {
        const result = await fetchCloudinaryResourceUrl(note);
        if (!result?.secureUrl) {
          throw downloadError;
        }

        const response = await axios.get(result.secureUrl, {
          responseType: 'arraybuffer'
        });
        fileBuffer = response.data;

        if (result.resourceType && result.resourceType !== note.fileResourceType) {
          note.fileResourceType = result.resourceType;
          note.save().catch(() => {});
        }
      } catch (error) {
        console.error('Error fetching from Cloudinary:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch file content'
        });
      }
    }

    fileContent = Buffer.from(fileBuffer).toString('base64');

    res.status(200).json({
      success: true,
      data: {
        content: fileContent,
        fileName: note.fileName,
        fileSize: note.fileSize,
        fileType: note.fileType
      }
    });
    
  } catch (error) {
    console.error('Download note error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to download note'
    });
  }
};

// Create new note
const createNote = async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      subject,
      semester,
      year,
      domain,
      track,
      technology,
      tags
    } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        error: 'Title is required'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'File is required'
      });
    }

    const uploaderRole = getUploaderRole(req.user);
    const uploaderName = req.user?.displayName || req.user?.email || 'User';

    const fileUrl = req.file.secure_url || req.file.path || '';
    const filePublicId = req.file.public_id || req.file.filename || '';
    const fileResourceType =
      req.file.resource_type || inferResourceTypeFromMime(req.file.mimetype || '');

    const note = await Note.create({
      title,
      description: description || '',
      category: category || '',
      subject: subject || '',
      semester: semester || '',
      year: year || '',
      domain: domain || '',
      track: track || '',
      technology: technology || '',
      tags: parseTags(tags),
      fileUrl,
      filePublicId,
      fileResourceType,
      fileName: req.file.originalname || 'note',
      fileType: req.file.mimetype || '',
      fileSize: req.file.size || 0,
      uploader: {
        id: req.user?._id || null,
        name: uploaderName,
        role: uploaderRole
      },
      visibility: 'public'
    });

    res.status(201).json({
      success: true,
      data: note
    });
  } catch (error) {
    console.error('Create note error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload note'
    });
  }
};

// Delete note (optional - for completeness)
const deleteNote = async (req, res) => {
  try {
    const { noteId } = req.params;
    
    const note = await Note.findById(noteId);
    
    if (!note) {
      return res.status(404).json({
        success: false,
        error: 'Note not found'
      });
    }

    // Check if user is the uploader or admin
    const isUploader = req.user && note.uploader.id && note.uploader.id.toString() === req.user._id?.toString();
    const isAdmin = req.user?.role?.includes('admin');
    
    if (!isUploader && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to delete this note'
      });
    }

    // Delete from Cloudinary if filePublicId exists
    if (note.filePublicId) {
      try {
        const resourceType = resolveCloudinaryResourceType(note);
        await cloudinary.uploader.destroy(note.filePublicId, {
          resource_type: resourceType
        });
      } catch (cloudinaryError) {
        console.error('Cloudinary delete error:', cloudinaryError);
        // Continue even if Cloudinary delete fails
      }
    }

    await Note.findByIdAndDelete(noteId);
    
    res.status(200).json({
      success: true,
      message: 'Note deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete note error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete note'
    });
  }
};

module.exports = { 
  listNotes, 
  createNote, 
  getNoteById, 
  getNoteContent, 
  downloadNote,
  deleteNote 
};
