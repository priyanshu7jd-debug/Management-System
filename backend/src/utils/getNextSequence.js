const Counter = require("../models/Counter");

/**
 * Atomically returns the next number in the named sequence, starting at 1.
 *
 * This is the standard MongoDB "auto-increment" pattern: findOneAndUpdate
 * with $inc is a single atomic operation on the storage engine, so calling
 * this concurrently (e.g. from several documents saved in parallel by
 * Model.create([...]) or Promise.all) can never hand out the same number
 * twice - unlike `await Model.countDocuments()`, which reads a snapshot
 * that is immediately stale once more than one insert is in flight.
 *
 * @param {string} name - Counter name/key, e.g. "disasterId".
 * @returns {Promise<number>} The next sequence value (1, 2, 3, ...).
 */
async function getNextSequence(name) {
  // Upserting a brand-new counter document concurrently can, in rare
  // cases, race and raise a duplicate-key error on the Counter's own
  // _id (two callers both try to insert the same new counter at once).
  // That is harmless and simply means the counter now exists - retry
  // once and the atomic $inc will proceed normally.
  try {
    const counter = await Counter.findOneAndUpdate(
      { _id: name },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    return counter.seq;
  } catch (err) {
    if (err && err.code === 11000) {
      const counter = await Counter.findOneAndUpdate(
        { _id: name },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      return counter.seq;
    }
    throw err;
  }
}

module.exports = getNextSequence;
