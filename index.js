const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const store = new session.MemoryStore();
const mongoose = require('mongoose');
const User = require('./models/users');
const config = require('./config.json')
const bodyParser = require('body-parser');

mongoose.connect(config.mongooseConnection, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})

const app = express();
const port = 80

app.use(session({ // Session
    secret: config.sessionSecret, // NOTE - Temporary secret
    cookie: { maxAge: 300000 },
    resave: true,
    saveUninitialized: false,
    store // Might change later on
}))

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));

app.get('/', (req, res) => {
    // console.log(store)
    // console.log(req.session)
    

    if (!req.session.authenticated) { // Redirect to /login if not authenticated
        res.redirect('/login')
    } else { // Otherwise, render home page (with session)
        res.render('home', {
            session: req.session
        })
    }

});

app.get('/login', (req, res) => {
    const message = req.query.message // This message is sent when a new account is made and the user is redirected to /login
    res.render('login', {message: message})
});

app.get('/register', (req, res) => {
    res.render('register')
});

// SECTION Post requests

app.post('/login', (req, res) => {
    const email = req.body.email.toLowerCase()
    const password = req.body.password

    User.findOne({email: email}, (err, foundResults) => {
        if (err) {
            res.status(500)
            console.log(err)
        } else {
            if (!foundResults || !bcrypt.compareSync(password, foundResults.password)) {

                const Error = 'Invalid login credentials'
                return res.render('login', {Error})
            } else if (bcrypt.compareSync(password, foundResults.password)) {

                req.session.authenticated = true
                res.redirect('/')
            }
        }
    })
});

app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Session deletion failed: ' + err)
            res.status(500)
        } else {
            res.status(204).end()
        }
    })
});

app.post('/register', (req, res) => {
    const email = req.body.email.toLowerCase() // TODO - Maybe send an email for confirmation?
    const username = req.body.username
    const password = req.body.password

    async function CreateAccount() {

        // Check if email is actually an email 
        const emailRegex = /^\S+@\S+\.\S+$/;
        if (!emailRegex.test(email)) {
            const emailError = 'Invalid Email address.'
            return res.render('register', {emailError});
        }

        if (!username.length || username.substring(0,1) === ' ' || !username.replace((/\s/g, '').length)) {
            const usernameError = 'Username must be atleast 1 character, not start with a space or be all spaces.'
            return res.render('register', {usernameError})

        } else if (password.length < 5) {
            const passwordError = 'Password must be atleast 5 characters'
            return res.render('register', {passwordError})

        } else {

        // Generate User Tags
        var getTag = (function(num) {
            return function() {
                var str = String(Math.floor(Math.random() * (10000 - 1) + 1));
                while (str.length < 4) str = "0" + str;
                return str;
            }
        })(1);

        const tag = getTag() // Tags work like how tags on discord work

        try {
            const doc = await User.findOne({ email: email }); // Look for the email in the database

            if (doc) { // If email is in the database then:
                const emailError = 'Email is already being used.'
                return res.render('register', {emailError}); // Send user an error

            } else {

                User.find({username: username}).count((err, count) => { // Check how many people have that username

                if (count >= 9999) { // If 9999 people (or more, but "more" probably won't happen, it's like that just incase) have the same name then:

                    const usernameError = 'Cannot use this username.'
                    return res.render('register', {usernameError}) // Send user an error. We're basically maxxing out how many people can use the name to 9999

                } else {

                    User.find({username: username, tag: tag}).then(docs => { // Check if someone has the same username and tag that was assigned to the User

                        if (docs.length > 0) { // If someone does have the same username and tag, we're going to start over again so that we can regenerate the tag and do our checks again
                            CreateAccount()
                                                        
                            // console.log(docs)
                            // console.log("Couldn't make an account: Same username and tag, trying again")
                            return;
                        } else {
                            const hashedPassword = bcrypt.hashSync(password, 10)

                            const newUser = new User({ // The User
                                email: email,
                                username: username,
                                tag: tag,
                                password: hashedPassword
                            });

                            newUser.save((err) => { // Save user to database
                                err ? console.log(err): res.redirect('/login?message= ' + encodeURIComponent('Created account.')); // and then redirect him to /login while sending a message that the account has been made.
                            });

                        }
                    })
                    
                }});
            }

        } catch (err) {
            console.error(err);
            res.status(500)
        }}
    }

CreateAccount();
});

// !SECTION

app.listen(port, () => {
    console.log(`Running on port ${port}`)
});

// npm run devStart