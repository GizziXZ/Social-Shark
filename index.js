const express = require('express');
const session = require('express-session');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const config = require('./config.json')
const bodyParser = require('body-parser');

mongoose.connect(config.mongooseConnection, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})

const app = express();
const store = new session.MemoryStore();
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

app.get('/login', (req, res) => { // TODO - make it so that when you go to /login or /register it checks for a session and if session already exists then redirect to /
    const message = req.query.message // This message is sent when a new account is made and the user is redirected to /login
    res.render('login', {message: message})
});

app.get('/register', (req, res) => {
    res.render('register')
});

app.get('/confirm', async (req, res) => { //TODO - there was something else I needed to do that I can't fucking remember that had to do with confirming but for the main part this all works
    const token = req.query.token;
    
    try {
        // Verify the token
        const decoded = jwt.verify(token, '123'); //NOTE - Temporary jwt secret

        User.findOne({email: decoded.email}, async (err, foundResults) => { // search for the decoded email in database
            if (!foundResults) { // if doesn't exist then return error
                return res.status(404).send('Invalid token.');
            } else if (foundResults.confirmed) { // if confirmed = true then give a message saying it's already confirmed
                return res.redirect('/login?message= ' + encodeURIComponent('Your account has already been confirmed.'));
            } else {
                // Change "confirmed" value to true in database and save
                foundResults.confirmed = true;
                await foundResults.save();

                req.session.destroy((err) => { // Delete existing session if it exists
                    if (err) {
                        console.error('Session deletion failed: ' + err)
                        res.status(500)
                    } else {
                        res.status(204).end()
                    }
                })

                // Redirect to the login page with a success message
                return res.redirect('/login?message= ' + encodeURIComponent('Your account has been confirmed.'));
            }
        })

    } catch (err) {
        console.error(err);
        return res.status(500).send('An error occurred while verifying your account.');
    }
});



// SECTION Post requests

const User = require('./models/users');

app.post('/login', (req, res) => {
    const email = req.body.email.toLowerCase() //TODO - add "forgot password"
    const password = req.body.password

    User.findOne({email: email}, (err, foundResults) => { // Search for the email in the database
        if (err) {
            res.status(500)
            console.log(err)
        } else {
            if (!foundResults || !bcrypt.compareSync(password, foundResults.password)) { // If the email isn't in the database or the password isn't the same one as the hashed password in the database then:

                const Error = 'Invalid login credentials'
                return res.render('login', {Error})
            } else if (bcrypt.compareSync(password, foundResults.password)) { // If password matches up with the hashed password in the database then login

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
    const email = req.body.email.toLowerCase()
    const username = req.body.username
    const password = req.body.password

    const token = jwt.sign({ email: email }, '123', { expiresIn: '48h' }); //NOTE - Temporary jwt secret

    const transporter = nodemailer.createTransport({ // Email transporter
        service: 'gmail',
        secure: false,
        auth: {
          user: config.EmailUser,
          pass: config.EmailPassword
        },
        tls: {
            rejectUnauthorized: false
        }
      });

    let confirmationEmail = {
        from: config.EmailUser,
        to: email,
        subject: 'Social Shark - Account Confirmation',
        text: 'Please click the link to confirm your account:',
        html: `<p>Please click the link to confirm your account:</p><a href="http://localhost/confirm?token=${token}">Confirm Account</a>`
    };

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
                            const hash = bcrypt.hashSync(password, 10) // Hash the password

                            const newUser = new User({ // The User
                                email: email,
                                username: username,
                                tag: tag,
                                password: hash, // Send hashed password to database
                                confirmed: false
                            });

                            transporter.sendMail(confirmationEmail, (err, info) => {
                                if (err) {
                                    console.error(err)
                                } else {
                                    console.log(info.response);
                                }
                            })

                            newUser.save((err) => { // Save user to database
                                err ? console.log(err): res.redirect('/login?message= ' + encodeURIComponent('Created account and sent a confirmation email.')); // and then redirect him to /login while sending a message that the account has been made.
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