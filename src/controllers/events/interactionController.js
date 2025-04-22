const Interaction = require('../../models/events/interactionModel');

const SCORE_MAP = {
    view: 1,
    like: 2,
    join: 3,
    rate: 2,
    share: 3
};

exports.createInteraction = async (req, res) => {
    try {
        const { userId, eventId, type } = req.body;

        const value = SCORE_MAP[type] || 1;

        const interaction = new Interaction({ userId, eventId, type, value });
        await interaction.save();

        res.status(200).json({ message: 'Interaction saved', interaction });

    } catch (error) {
        res.status(500).json({ message: 'Error saving interaction', error: error.message });
    }
}