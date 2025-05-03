const Event = require('../../models/events/eventModel');

exports.addTagsToEvent = async (req, res) => {
  try {
    const { id, tags } = req.body;
    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({ status: false, message: 'Event not found' });
    }
    event.tags = Array.isArray(tags) ? tags : [];
    await event.save();
    res.status(200).json({ status: true, message: 'Tags updated successfully', data: event });
  } catch (error) {
    res.status(500).json({ status: false, message: 'Error: ' + error.message });
  }
}; 