const mongoose = require('mongoose');
const { default: slugify } = require('slugify');
const tagSchema = new mongoose.Schema({
  name: { type: String, unique: true, required: true },
  slug: { type: String, required: true, unique: true },
  isDefault: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdAt: { type: Date, default: Date.now }
});
tagSchema.pre("validate", function (next) {
  if (this.isModified("name")) {
    this.slug = slugify(this.name, { lower: true, strict: true }); // strict để bỏ ký tự đặc biệt
  }
  next();
});
module.exports = mongoose.model('tags', tagSchema);