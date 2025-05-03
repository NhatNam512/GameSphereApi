const Joi = require('joi');

const eventSchema = Joi.object({
  name: Joi.string().required().messages({
    'string.empty': 'Tên sự kiện không được để trống',
    'any.required': 'Tên sự kiện là bắt buộc'
  }),
  description: Joi.string().required(),
  timeStart: Joi.date().required(),
  timeEnd: Joi.date().required(),
  avatar: Joi.string().required(),
  images: Joi.array().items(Joi.string()),
  categories: Joi.string().required(),
  banner: Joi.string().required(),
  location: Joi.string().required(),
  ticketPrice: Joi.number().required(),
  ticketQuantity: Joi.number().required(),
  rating: Joi.number(),
  longitude: Joi.number(),
  latitude: Joi.number(),
  userId: Joi.string().required(),
  tags: Joi.array().items(Joi.string())
});

const eventTagsSchema = Joi.object({
  id: Joi.string().required(),
  tags: Joi.array().items(Joi.string()).required()
});

module.exports = { eventSchema, eventTagsSchema }; 