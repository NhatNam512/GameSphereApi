var express = require('express');
var router = express.Router();
const categoryModel = require("../models/categoryModel");
const JWT = require('jsonwebtoken');
const config = require("../until/tokenConfig");

module.exports = router;
