const express = require('express');
const { 
  listNotes, 
  createNote, 
  getNoteById, 
  getNoteContent, 
  downloadNote,
  deleteNote 
} = require('../controllers/noteController');
const { notesAuthMiddleware } = require('../middleware/notesAuth');
const { noteUpload } = require('../middleware/noteUpload');

const router = express.Router();

// Public routes (require auth for some)
router.get('/', listNotes);
router.get('/:noteId', notesAuthMiddleware, getNoteById);
router.get('/:noteId/content', notesAuthMiddleware, getNoteContent);
router.get('/:noteId/download', notesAuthMiddleware, downloadNote);

// Protected routes (require auth)
router.post('/', notesAuthMiddleware, noteUpload.single('file'), createNote);
router.delete('/:noteId', notesAuthMiddleware, deleteNote);

module.exports = router;