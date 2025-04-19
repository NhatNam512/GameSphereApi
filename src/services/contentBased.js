var express = require('express');
var router = express.Router();
const natural = require("natural");
const mongoose = require("mongoose");
const eventModel = require("../models/events/eventModel")
const redis = require("../redis/redisClient");

async function preprocessAndStoreVectors() {
    const events = await eventModel.find();
    if (!events.length) return;

    const tfidf = new natural.TfIdf(); // Khởi tạo bộ tính TF-IDF
    events.forEach(event => tfidf.addDocument(event.description));// Thêm mô tả sự kiện vào mô hình TF-IDF
  
    const vectors = {};
    events.forEach((event, i)=>{
        const vector = [];
        tfidf.tfidfs(event.description, (_, score)=>vector.push(score));
        vectors[event._id] = vector; // Lưu vector TF-IDF theo ID sự kiện
    });
    await redis.set("tfidf_vectors", JSON.stringify(vectors));// Lưu vào Redis
    console.log("TF-IDF vectors stored in Redis");
  }

// Hàm tính toán độ tương đồng
// Cosine Similarity (Độ tương đồng cosine) 
// là một phép đo được sử dụng để xác định độ tương đồng giữa hai vector. 
// Nó được sử dụng trong tìm kiếm vector và RAG để tìm các vector hoặc đoạn văn bản tương tự. 
// Độ tương đồng cosine được tính bằng cosine của góc giữa hai vector, 
// với giá trị 1 biểu thị sự tương đồng hoàn hảo và giá trị -1 biểu thị sự khác biệt hoàn toàn.
// Cosine Similarity = A.B/|A|.|B| (A.B là tích vô hướng, |A|.|B| là tích độ dàidài)
function cosineSimilarity(vecA, vecB){
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * (vecB[i]||0), 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a ** 2, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b ** 2, 0));

    return magnitudeA && magnitudeB ? dotProduct / (magnitudeA * magnitudeB) : 0;
}
// Hàm tìm sự kiện tương tự
async function getSimilarEvents(eventId, topN = 5) {
    const vectors = JSON.parse(await redis.get("tfidf_vectors")); // Lấy vector từ Redis
    if (!vectors || !vectors[eventId]) return [];

    const queryVector = vectors[eventId]; // Lấy vector của sự kiện cần tìm
    const scores = Object.keys(vectors).map(id => {
        if (id === eventId) return null;
        return { eventId: id, score: cosineSimilarity(queryVector, vectors[id]) };
    }).filter(Boolean);

    return scores.sort((a, b) => b.score - a.score).slice(0, topN).map(e => e.eventId);
}
// Gọi updateEventVector(eventId, description) mỗi khi có sự kiện mới để cập nhật dữ liệu.
async function updateEventVector(eventId, description) {
    const tfidf = new natural.TfIdf();
    tfidf.addDocument(description);

    const vector = [];
    tfidf.tfidfs(description, (_, score) => vector.push(score));

    const vectors = JSON.parse(await redis.get("tfidf_vectors")) || {};
    vectors[eventId] = vector; // Cập nhật vector mới
    await redis.set("tfidf_vectors", JSON.stringify(vectors));

    console.log(`Updated TF-IDF vector for event ${eventId}`);
}
// Chạy tiền xử lý (Chỉ chạy khi cập nhật dữ liệu)
preprocessAndStoreVectors();

module.exports = { getSimilarEvents, updateEventVector };