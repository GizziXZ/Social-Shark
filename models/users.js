const mongoose = require('mongoose')

const UsersSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true
    },
    username: {
        type: String,
        required: true
    },
    tag: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    }
});

const User = new mongoose.model("User", UsersSchema);

module.exports = User;