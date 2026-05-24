const mongoose = require('mongoose');
const Notification = require('../models/Notification');

const parseLimit = (value, fallback = 50, max = 200) => {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
};

const parseSkip = (value) => {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
};

exports.listNotifications = async (req, res) => {
  try {
    const { status, includeCleared, audience, limit, skip } = req.query;
    const query = { user: req.user._id };

    if (!includeCleared || includeCleared === 'false') {
      query.isCleared = false;
    }

    if (status === 'unread') {
      query.isRead = false;
    } else if (status === 'read') {
      query.isRead = true;
    }

    if (audience) {
      const legacyTypes = audience === 'expert'
        ? ['booking', 'system']
        : ['meeting_started', 'system'];
      query.$or = [
        { audience },
        { audience: 'both' },
        { audience: { $exists: false }, type: { $in: legacyTypes } }
      ];
    }

    const effectiveLimit = parseLimit(limit);
    const effectiveSkip = parseSkip(skip);

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(effectiveSkip)
        .limit(effectiveLimit),
      Notification.countDocuments(query),
      Notification.countDocuments({ ...query, isRead: false })
    ]);

    res.status(200).json({
      success: true,
      notifications,
      total,
      unreadCount,
      limit: effectiveLimit,
      skip: effectiveSkip
    });
  } catch (error) {
    console.error('List notifications error:', error);
    res.status(500).json({ message: 'Server error while fetching notifications' });
  }
};

exports.markRead = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findOneAndUpdate(
      { _id: id, user: req.user._id },
      { isRead: true, readAt: new Date() },
      { returnDocument: 'after' }
    );

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    res.status(200).json({ success: true, notification });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ message: 'Server error while updating notification' });
  }
};

exports.markUnread = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findOneAndUpdate(
      { _id: id, user: req.user._id },
      { isRead: false, readAt: null },
      { returnDocument: 'after' }
    );

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    res.status(200).json({ success: true, notification });
  } catch (error) {
    console.error('Mark unread error:', error);
    res.status(500).json({ message: 'Server error while updating notification' });
  }
};

exports.clearNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findOneAndUpdate(
      { _id: id, user: req.user._id },
      { isCleared: true, clearedAt: new Date() },
      { returnDocument: 'after' }
    );

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    res.status(200).json({ success: true, notification });
  } catch (error) {
    console.error('Clear notification error:', error);
    res.status(500).json({ message: 'Server error while clearing notification' });
  }
};

exports.clearAllNotifications = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { user: req.user._id, isCleared: false },
      { isCleared: true, clearedAt: new Date() }
    );

    res.status(200).json({ success: true, cleared: result.modifiedCount || 0 });
  } catch (error) {
    console.error('Clear all notifications error:', error);
    res.status(500).json({ message: 'Server error while clearing notifications' });
  }
};

exports.listNotificationsByUserId = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, includeCleared, audience, limit, skip } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const query = { user: id };

    if (!includeCleared || includeCleared === 'false') {
      query.isCleared = false;
    }

    if (status === 'unread') {
      query.isRead = false;
    } else if (status === 'read') {
      query.isRead = true;
    }

    if (audience) {
      const legacyTypes = audience === 'expert'
        ? ['booking', 'system']
        : ['meeting_started', 'system'];
      query.$or = [
        { audience },
        { audience: 'both' },
        { audience: { $exists: false }, type: { $in: legacyTypes } }
      ];
    }

    const effectiveLimit = parseLimit(limit, 100);
    const effectiveSkip = parseSkip(skip);

    const [notifications, total] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(effectiveSkip)
        .limit(effectiveLimit),
      Notification.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      notifications,
      total,
      limit: effectiveLimit,
      skip: effectiveSkip
    });
  } catch (error) {
    console.error('Admin list notifications error:', error);
    res.status(500).json({ message: 'Server error while fetching notifications' });
  }
};
