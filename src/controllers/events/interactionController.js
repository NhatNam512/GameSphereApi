const dayjs = require('dayjs');
const Interaction = require('../../models/events/interactionModel');
const redis = require('../../redis/redisClient');
const zoneModel = require('../../models/events/zoneModel');
const ZoneTicket = require('../../models/events/zoneTicketModel');
const showtimeModel = require('../../models/events/showtimeModel');

exports.createInteraction = async (req, res) => {
    try {
        const userId = req.user.id;
        const { eventId, type } = req.body;
        const SCORE_MAP = { view: 1, like: 2, join: 3, rate: 2, share: 3 };
        const value = SCORE_MAP[type] || 1;

        let interaction;
        let isNew = false;

        if (type === 'view') {
            const today = dayjs().format('YYYY-MM-DD');
            const existing = await Interaction.findOne({ userId, eventId, type, date: today });

            if (existing) {
                existing.value += 1;
                interaction = await existing.save();
            } else {
                interaction = new Interaction({ userId, eventId, type, value, date: today });
                await interaction.save();
                isNew = true;
            }
        } else {
            const existing = await Interaction.findOne({ userId, eventId, type });
            if (existing) {
                existing.createdAt = new Date(); // Cập nhật timestamp để TTL reset
                interaction = await existing.save();
            } else {
                interaction = new Interaction({ userId, eventId, type, value });
                await interaction.save();
                isNew = true;
            }
        }

        await redis.xAdd('event_view', '*', {
            userId,
            eventId,
            type,
            value: value.toString(), // Redis chỉ nhận string
            date: interaction.date || '', // view thì có, loại khác thì không
            timestamp: new Date().toISOString()
        });

        res.status(200).json({ message: isNew ? 'Interaction saved' : 'Interaction updated', interaction });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getEventTotalScores = async (req, res) => {
    const fromDate = dayjs().subtract(7, 'day').format('YYYY-MM-DD');
    const limit = parseInt(req.query.limit) || 10;
  
    try {
      const result = await Interaction.aggregate([
        { $match: { date: { $gte: fromDate } } },
        {
          $group: {
            _id: '$eventId',
            totalScore: { $sum: '$value' }
          }
        },
        {
          $addFields: {
            eventIdObj: {
              $convert: {
                input: '$_id',
                to: 'objectId',
                onError: null,
                onNull: null
              }
            }
          }
        },
        {
          $lookup: {
            from: 'events',
            localField: 'eventIdObj',
            foreignField: '_id',
            as: 'event'
          }
        },
        { $unwind: '$event' },
        { $sort: { totalScore: -1 } },
        { $limit: limit }
      ]);
  
      const enrichedResult = await Promise.all(result.map(async item => {
        const ev = item.event;
        let ticketPrices = [];
  
        if (ev.location_map && ev.location_map.coordinates) {
          ev.longitude = ev.location_map.coordinates[0];
          ev.latitude = ev.location_map.coordinates[1];
        }
  
        if (ev.typeBase === 'seat') {
          const zones = await zoneModel.find({ eventId: ev._id }).select('layout.seats.price');
          zones.forEach(zone => {
            if (zone?.layout?.seats) {
              const prices = zone.layout.seats.map(seat => seat.price).filter(p => p != null);
              ticketPrices.push(...prices);
            }
          });
        } else if (ev.typeBase === 'zone') {
          const zoneTickets = await ZoneTicket.find({ eventId: ev._id }).select('price');
          ticketPrices = zoneTickets.map(t => t.price).filter(p => p != null);
        } else if (ev.typeBase === 'none') {
          const showtimes = await showtimeModel.find({ eventId: ev._id }).select('ticketPrice');
          ticketPrices = showtimes.map(st => st.ticketPrice).filter(p => p != null);
        }
  
        const minTicketPrice = ticketPrices.length > 0 ? Math.min(...ticketPrices) : null;
        const maxTicketPrice = ticketPrices.length > 0 ? Math.max(...ticketPrices) : null;
  
        return {
          eventId: item._id,
          totalScore: item.totalScore,
          name: ev.name,
          timeStart: ev.timeStart,
          timeEnd: ev.timeEnd,
          avatar: ev.avatar,
          categories: ev.categories,
          tags: ev.tags,
          ticketPrice: ev.ticketPrice,
          ticketQuantity: ev.ticketQuantity,
          minTicketPrice,
          maxTicketPrice
        };
      }));
  
      res.json(enrichedResult);
    } catch (e) {
      console.error("❌ Error in getEventTotalScores:", e);
      res.status(500).json({ status: false, message: "Lỗi server: " + e.message });
    }
  };


