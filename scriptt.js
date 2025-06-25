const mongoose = require("mongoose");
const slugify = require("slugify");
const tagModel = require("./src/models/events/tagModel");

const DEFAULT_TAGS = [
  "Âm nhạc",
  "Hội thảo",
  "Triển lãm",
  "Workshop",
  "Giải trí",
  "Thể thao",
  "Khuyến mãi",
  "Công nghệ",
  "Gia đình & Trẻ em",
  "Nghệ thuật"
];

async function seedDefaultTags() {
  try {
    await mongoose.connect("mongodb+srv://namnnps38713:wcVNA8PAeuqTioxq@namnnps38713.bctmi.mongodb.net/"); // thay bằng DB bạn

    for (const name of DEFAULT_TAGS) {
      const slug = slugify(name, { lower: true, strict: true });

      const existing = await tagModel.findOne({ slug });
      if (!existing) {
        await tagModel.create({
          name,
          slug,
          isDefault: true,
        });
        console.log(`✅ Đã tạo tag: ${name} (${slug})`);
      } else {
        console.log(`⚠️ Tag đã tồn tại: ${name}`);
      }
    }

    console.log("🎉 Seed tag mặc định hoàn tất!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Lỗi khi seed tag:", err.message);
    process.exit(1);
  }
}

seedDefaultTags();