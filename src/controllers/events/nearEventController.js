const eventModel = require('../../models/events/eventModel');

const getNearEvents = async (req, res, next) => {
    try {
        const { longitude, latitude } = req.query;
        const radius = 5000; // 5km in meters

        if (!longitude || !latitude) {
            const error = new Error('Longitude and latitude are required.');
            error.statusCode = 400;
            throw error;
        }

        const events = await eventModel.find({
            location_map: {
                $nearSphere: {
                    $geometry: {
                        type: "Point",
                        coordinates: [parseFloat(longitude), parseFloat(latitude)]
                    },
                    $maxDistance: radius
                }
            }
        });

        if (events.length > 0) {
            res.status(200).json({
                status: true,
                message: `Lấy sự kiện gần với vị trí (${latitude}, ${longitude}) thành công.`,
                data: events
            });
        } else {
            res.status(404).json({
                status: false,
                message: `Không tìm thấy sự kiện nào trong bán kính ${radius / 1000}km từ vị trí của bạn.`
            });
        }
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getNearEvents
};
