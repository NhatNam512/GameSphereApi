const Event = require('../../models/events/eventModel');
const Tag = require('../../models/events/tagModel');

exports.addTagsToEvent = async (req, res) => {
  try {
    const { id, tags} = req.body;
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

exports.suggestTags = async (req, res) => {
  try {
    const search = req.query.search || '';
    const tags = await Tag.find({ name: { $regex: search, $options: 'i' } })
      .sort({ name: 1 })
      .limit(20);
    res.json(tags.map(tag => tag.name));
  } catch (err) {
    res.status(500).json({ message: 'Lỗi lấy tag', error: err.message });
  }
};

exports.createTag = async (req, res) => {
  try {
    const { name, isDefault } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Tên tag không hợp lệ' });
    }

    const tagName = name.trim();
    const slug = slugify(tagName, { lower: true, strict: true });

    // Kiểm tra trùng slug
    let tag = await Tag.findOne({ slug });
    if (!tag) {
      tag = await Tag.create({
        name: tagName,
        isDefault: !!isDefault,
        createdBy: req.user?.id,
      });
    }

    res.json(tag);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi tạo tag', error: err.message });
  }
};