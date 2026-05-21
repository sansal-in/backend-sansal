const Expert = require('../models/Expert');
const Booking = require('../models/Booking');
const { SLOT_LOCK_DURATION_MINUTES } = require('../utils/constants');

const normalizeSlotType = (slot) => (slot?.type === 'group' ? 'group' : 'individual');

const getCapacity = (slot) => {
  const slotType = normalizeSlotType(slot);
  let capacity = Number(slot?.capacity);
  if (!Number.isFinite(capacity) || capacity <= 0) {
    capacity = slotType === 'group' ? 10 : 1;
  }
  if (slotType === 'individual') return 1;
  return Math.max(2, Math.min(10, capacity));
};

const getBookedCount = (slot) => {
  let count = Number(slot?.bookedCount);
  if (!Number.isFinite(count) || count < 0) count = 0;
  if (Array.isArray(slot?.bookingIds) && slot.bookingIds.length > 0) {
    count = Math.max(count, slot.bookingIds.length);
  }
  if (count === 0 && slot?.bookingId) count = 1;
  return count;
};

const cleanupExpiredGroupLocks = (slot) => {
  if (!Array.isArray(slot?.lockedSeats) || slot.lockedSeats.length === 0) return 0;
  const now = Date.now();
  const before = slot.lockedSeats.length;
  slot.lockedSeats = slot.lockedSeats.filter(lock => {
    if (!lock?.lockedAt) return false;
    const lockAge = (now - new Date(lock.lockedAt).getTime()) / 1000 / 60;
    return lockAge <= SLOT_LOCK_DURATION_MINUTES;
  });
  return before - slot.lockedSeats.length;
};

const getLockedSeatsCount = (slot) => {
  if (!Array.isArray(slot?.lockedSeats)) return 0;
  return slot.lockedSeats.length;
};

class SlotService {
  // Lock a slot for booking
  async lockSlot(expertId, slotId, userId) {
    const expert = await Expert.findById(expertId);
    
    if (!expert) {
      throw new Error('Expert not found');
    }
    
    const slot = expert.availableSlots.id(slotId);
    
    if (!slot) {
      throw new Error('Slot not found');
    }
    
    const slotType = normalizeSlotType(slot);

    if (slotType === 'group') {
      cleanupExpiredGroupLocks(slot);
      if (!Array.isArray(slot.lockedSeats)) {
        slot.lockedSeats = [];
      }
      const userIdStr = userId.toString();
      const alreadyLocked = slot.lockedSeats.some(lock => lock.userId?.toString() === userIdStr);
      if (alreadyLocked) {
        return { slot, expert };
      }
      const capacity = getCapacity(slot);
      const bookedCount = getBookedCount(slot);
      const lockedCount = getLockedSeatsCount(slot);
      if (bookedCount + lockedCount >= capacity) {
        throw new Error('Slot is full');
      }
      slot.lockedSeats.push({ userId, lockedAt: new Date() });
      await expert.save();
      return { slot, expert };
    }

    // Check if slot is already booked or locked by someone else
    if (slot.status === 'booked') {
      throw new Error('Slot is already booked');
    }
    
    if (slot.status === 'locked') {
      // Check if lock has expired
      const lockAge = (Date.now() - new Date(slot.lockedAt).getTime()) / 1000 / 60;
      
      if (lockAge < SLOT_LOCK_DURATION_MINUTES) {
        // Check if locked by same user
        if (slot.lockedBy?.toString() === userId.toString()) {
          return { slot, expert }; // Return existing lock
        }
        throw new Error('Slot is temporarily locked by another user');
      }
      // Lock expired, can proceed
    }
    
    // Lock the slot
    slot.status = 'locked';
    slot.lockedAt = new Date();
    slot.lockedBy = userId;
    
    await expert.save();
    
    return { slot, expert };
  }
  
  // Unlock a slot
  async unlockSlot(expertId, slotId) {
    const expert = await Expert.findById(expertId);
    
    if (!expert) {
      throw new Error('Expert not found');
    }
    
    const slot = expert.availableSlots.id(slotId);
    
    if (!slot) {
      throw new Error('Slot not found');
    }
    
    const slotType = normalizeSlotType(slot);
    if (slotType === 'group') {
      slot.lockedSeats = [];
      await expert.save();
      return { slot, expert };
    }

    if (slot.status !== 'locked') {
      return { slot, expert }; // Already unlocked
    }
    
    slot.status = 'available';
    slot.lockedAt = null;
    slot.lockedBy = null;
    
    await expert.save();
    
    return { slot, expert };
  }
  
  // Confirm slot booking after payment
  async confirmSlotBooking(expertId, slotId, bookingId) {
    const expert = await Expert.findById(expertId);
    
    if (!expert) {
      throw new Error('Expert not found');
    }
    
    const slot = expert.availableSlots.id(slotId);
    
    if (!slot) {
      throw new Error('Slot not found');
    }
    
    const slotType = normalizeSlotType(slot);

    if (slotType === 'group') {
      cleanupExpiredGroupLocks(slot);
      if (!Array.isArray(slot.bookingIds)) {
        slot.bookingIds = [];
      }
      const bookingIdStr = bookingId.toString();
      const alreadyBooked = slot.bookingIds.some(id => id.toString() === bookingIdStr);
      if (alreadyBooked) {
        return { slot, expert };
      }
      const capacity = getCapacity(slot);
      const bookedCount = getBookedCount(slot);
      if (bookedCount >= capacity) {
        throw new Error('Slot is full');
      }
      slot.type = 'group';
      slot.capacity = capacity;
      slot.bookingIds.push(bookingId);
      slot.bookingId = null;
      slot.bookedCount = getBookedCount(slot);
      slot.status = slot.bookedCount >= capacity ? 'booked' : 'available';

      // Remove any lock for this user if possible
      const booking = await Booking.findById(bookingId).select('userId');
      const bookingUserId = booking?.userId?.toString();
      if (bookingUserId && Array.isArray(slot.lockedSeats)) {
        slot.lockedSeats = slot.lockedSeats.filter(lock => lock.userId?.toString() !== bookingUserId);
      }

      await expert.save();
      return { slot, expert };
    }

    slot.status = 'booked';
    slot.bookingId = bookingId;
    slot.bookedCount = 1;
    slot.type = 'individual';
    slot.capacity = 1;
    
    await expert.save();
    
    return { slot, expert };
  }
  
  // Release slot (when booking is cancelled)
  async releaseSlot(expertId, slotId, bookingId = null) {
    const expert = await Expert.findById(expertId);
    
    if (!expert) {
      throw new Error('Expert not found');
    }
    
    const slot = expert.availableSlots.id(slotId);
    
    if (!slot) {
      throw new Error('Slot not found');
    }
    
    const slotType = normalizeSlotType(slot);

    if (slotType === 'group') {
      if (!Array.isArray(slot.bookingIds)) {
        slot.bookingIds = [];
      }
      if (bookingId) {
        const bookingIdStr = bookingId.toString();
        slot.bookingIds = slot.bookingIds.filter(id => id.toString() !== bookingIdStr);
        // Remove lock for this user if we can resolve userId
        const booking = await Booking.findById(bookingId).select('userId');
        const bookingUserId = booking?.userId?.toString();
        if (bookingUserId && Array.isArray(slot.lockedSeats)) {
          slot.lockedSeats = slot.lockedSeats.filter(lock => lock.userId?.toString() !== bookingUserId);
        }
      }
      slot.bookingId = null;
      if (Array.isArray(slot.bookingIds) && slot.bookingIds.length > 0) {
        slot.bookedCount = slot.bookingIds.length;
      } else {
        const current = getBookedCount(slot);
        slot.bookedCount = Math.max(0, current - (bookingId ? 1 : 0));
      }
      const capacity = getCapacity(slot);
      slot.status = slot.bookedCount >= capacity ? 'booked' : 'available';
      await expert.save();
      return { slot, expert };
    }

    slot.status = 'available';
    slot.lockedAt = null;
    slot.lockedBy = null;
    slot.bookingId = null;
    slot.bookedCount = 0;
    
    await expert.save();
    
    return { slot, expert };
  }
  
  // Get available slots for an expert
  async getAvailableSlots(expertId, startDate, endDate) {
    const expert = await Expert.findById(expertId);
    
    if (!expert) {
      throw new Error('Expert not found');
    }
    
    let slots = expert.availableSlots.filter(slot => {
      const slotType = normalizeSlotType(slot);
      const capacity = getCapacity(slot);
      const bookedCount = getBookedCount(slot);
      const lockedCount = getLockedSeatsCount(slot);
      const remainingSeats = capacity - bookedCount - lockedCount;

      if (slotType === 'group') {
        if (remainingSeats <= 0) return false;
      } else {
        // Only show available slots
        if (slot.status !== 'available') return false;
      }
      
      // Filter by date range if provided
      const slotDate = new Date(slot.date);
      if (startDate && slotDate < new Date(startDate)) return false;
      if (endDate && slotDate > new Date(endDate)) return false;
      
      // Don't show past slots
      const now = new Date();
      const slotDateTime = new Date(slot.date);
      const [hours, minutes] = slot.startTime.split(':').map(Number);
      slotDateTime.setHours(hours, minutes, 0, 0);
      
      return slotDateTime > now;
    });
    
    // Sort by date and time
    slots.sort((a, b) => {
      const dateCompare = new Date(a.date) - new Date(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.startTime.localeCompare(b.startTime);
    });
    
    return slots.map(slot => {
      const slotType = normalizeSlotType(slot);
      const capacity = getCapacity(slot);
      const bookedCount = getBookedCount(slot);
      const lockedCount = getLockedSeatsCount(slot);
      const remainingSeats = Math.max(0, capacity - bookedCount - lockedCount);
      const obj = slot.toObject ? slot.toObject() : slot;
      return {
        ...obj,
        type: slotType,
        capacity,
        bookedCount,
        remainingSeats
      };
    });
  }
  
  // Cleanup expired locks (run periodically)
  async cleanupExpiredLocks() {
    const experts = await Expert.find({
      $or: [
        { 'availableSlots.status': 'locked' },
        { 'availableSlots.lockedSeats.0': { $exists: true } }
      ]
    });
    
    let unlockedCount = 0;
    const now = Date.now();
    
    for (const expert of experts) {
      let modified = false;
      
      expert.availableSlots.forEach(slot => {
        if (slot.status === 'locked' && slot.lockedAt) {
          const lockAge = (now - new Date(slot.lockedAt).getTime()) / 1000 / 60;
          
          if (lockAge > SLOT_LOCK_DURATION_MINUTES) {
            slot.status = 'available';
            slot.lockedAt = null;
            slot.lockedBy = null;
            modified = true;
            unlockedCount++;
          }
        }
        if (Array.isArray(slot.lockedSeats) && slot.lockedSeats.length > 0) {
          const removed = cleanupExpiredGroupLocks(slot);
          if (removed > 0) {
            modified = true;
            unlockedCount += removed;
          }
        }
      });
      
      if (modified) {
        await expert.save();
      }
    }
    
    //console.log(`Cleaned up ${unlockedCount} expired slot locks`);
    return unlockedCount;
  }
  
  // Bulk add slots for an expert
  async bulkAddSlots(expertId, slots) {
    const expert = await Expert.findById(expertId);
    
    if (!expert) {
      throw new Error('Expert not found');
    }
    
    const addedSlots = [];
    const errors = [];
    
    for (const slotData of slots) {
      try {
        // Check for duplicate
        const duplicate = expert.availableSlots.find(
          s => 
            new Date(s.date).toDateString() === new Date(slotData.date).toDateString() &&
            s.startTime === slotData.startTime
        );
        
        if (duplicate) {
          errors.push({
            slot: slotData,
            error: 'Slot already exists'
          });
          continue;
        }
        
        const normalizedType = slotData.type === 'group' ? 'group' : 'individual';
        let capacity = Number(slotData.capacity);
        if (!Number.isFinite(capacity) || capacity <= 0) {
          capacity = normalizedType === 'group' ? 10 : 1;
        }
        if (normalizedType === 'individual') {
          capacity = 1;
        } else {
          capacity = Math.max(2, Math.min(10, capacity));
        }

        expert.availableSlots.push({
          date: new Date(slotData.date),
          startTime: slotData.startTime,
          endTime: slotData.endTime,
          status: 'available',
          type: normalizedType,
          capacity,
          bookedCount: 0
        });
        
        addedSlots.push(slotData);
      } catch (error) {
        errors.push({
          slot: slotData,
          error: error.message
        });
      }
    }
    
    await expert.save();
    
    return {
      added: addedSlots.length,
      errors
    };
  }
  
  // Delete a slot
  async deleteSlot(expertId, slotId) {
    const expert = await Expert.findById(expertId);
    
    if (!expert) {
      throw new Error('Expert not found');
    }
    
    const slot = expert.availableSlots.id(slotId);
    
    if (!slot) {
      throw new Error('Slot not found');
    }
    
    const bookedCount = getBookedCount(slot);
    const hasBookings = bookedCount > 0 || (Array.isArray(slot.bookingIds) && slot.bookingIds.length > 0);
    if (slot.status === 'booked' || hasBookings) {
      throw new Error('Cannot delete a booked slot');
    }
    
    expert.availableSlots.pull(slotId);
    await expert.save();
    
    return { success: true };
  }
}

module.exports = new SlotService();
