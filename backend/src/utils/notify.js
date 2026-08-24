const Notification = require("../models/Notification");

/**
 * Create a notification. Fire-and-forget by design: notification delivery is
 * a side effect of the primary action (issuing an alert, assigning a task,
 * updating a donation) and must never fail or slow down that primary request.
 * Errors are logged, not thrown.
 *
 * @param {Object} payload
 * @param {string|null} payload.recipient - User id, or null to broadcast to everyone
 * @param {"Alert"|"Task"|"Donation"|"Disaster"|"Shelter"|"System"} payload.type
 * @param {string} payload.title
 * @param {string} [payload.message]
 * @param {string|null} [payload.createdBy]
 * @param {Object} [payload.related] - e.g. { relatedAlert: id } / { relatedTask: id }
 */
const notify = async ({ recipient = null, type, title, message = "", createdBy = null, related = {} }) => {
  try {
    await Notification.create({
      recipient,
      type,
      title,
      message,
      createdBy,
      ...related,
    });
  } catch (err) {
    console.error(`Failed to create notification (${type} - ${title}): ${err.message}`);
  }
};

/**
 * Notify many specific users at once (e.g. every Approved volunteer in a district).
 * Uses insertMany for efficiency; still never throws.
 */
const notifyMany = async (recipientIds, { type, title, message = "", createdBy = null, related = {} }) => {
  if (!recipientIds || recipientIds.length === 0) return;
  try {
    const docs = recipientIds.map((recipient) => ({
      recipient,
      type,
      title,
      message,
      createdBy,
      ...related,
    }));
    await Notification.insertMany(docs);
  } catch (err) {
    console.error(`Failed to create bulk notifications (${type} - ${title}): ${err.message}`);
  }
};

module.exports = { notify, notifyMany };
