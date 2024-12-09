const express = require('express');
const admin = require('firebase-admin');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
const session = require('express-session');
const axios = require('axios'); // Import axios for LibreTranslate

dotenv.config();

const app = express();
const port = 3000;

const serviceAccount = require('./key.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://<YOUR_PROJECT_ID>.firebaseio.com'
});
const db = admin.firestore();

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true
}));
app.use(express.static('public'));

function checkAuthenticated(req, res, next) {
    if (req.session.userId) {
        return next();
    }
    res.redirect('/login');
}

app.get('/', checkAuthenticated, (req, res) => {
    res.redirect('/index');
});

app.get('/signup', (req, res) => {
    res.render('signup', { title: 'Signup' });
});

app.post('/signup', async (req, res) => {
    const { name, phone, email, password } = req.body;
    try {
        const userSnapshot = await db.collection('users').where('email', '==', email).get();
        if (!userSnapshot.empty) {
            return res.status(400).send('User already exists');
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await db.collection('users').add({
            name,
            phone,
            email,
            password: hashedPassword
        });

        res.redirect('/login');
    } catch (error) {
        console.error('Error signing up:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/login', (req, res) => {
    res.render('login', { title: 'Login' });
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const userSnapshot = await db.collection('users').where('email', '==', email).get();
        if (userSnapshot.empty) {
            return res.status(400).send('User not found');
        }

        const user = userSnapshot.docs[0].data();
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).send('Incorrect password');
        }

        req.session.userId = userSnapshot.docs[0].id;
        res.redirect('/index');
    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/index', checkAuthenticated, (req, res) => {
    res.render('index', { title: 'Home' });
});

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).send('Internal Server Error');
        }
        res.redirect('/login');
    });
});

async function getNotes() {
    const snapshot = await db.collection('notes').get();
    return snapshot.docs.map(doc => doc.data());
}

app.get('/notes', checkAuthenticated, async (req, res) => {
    try {
        const notes = await getNotes();
        res.render('notes', { title: 'Notes', notes });
    } catch (error) {
        console.error('Error getting notes:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/add-note', checkAuthenticated, (req, res) => {
    res.render('add-note', { title: 'Add Note' });
});

app.post('/add-note', checkAuthenticated, async (req, res) => {
    const { title, content } = req.body;
    try {
        await db.collection('notes').add({ title, content });
        res.redirect('/notes');
    } catch (error) {
        console.error('Error adding note:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/translate', checkAuthenticated, (req, res) => {
    res.render('translate', { title: 'Translator', translatedText: null });
});

app.post('/translate', checkAuthenticated, async (req, res) => {
    const { text, targetLanguage } = req.body;
    let translation = '';
    const maxRetries = 3; // Number of retry attempts
    let attempts = 0;
    let success = false;

    while (attempts < maxRetries && !success) {
        try {
            const response = await axios.post('https://translation.googleapis.com/language/translate/v2', {
                q: text,
                target: targetLanguage,
                format: 'text'
            }, {
                params: {
                    key: process.env.GOOGLE_API_KEY // Ensure this is set in your .env file
                }
            });

            if (response.data && response.data.data && response.data.data.translations) {
                translation = response.data.data.translations[0].translatedText;
                success = true;
            } else {
                throw new Error('Unexpected response structure');
            }
        } catch (error) {
            attempts++;
            console.error(`Error translating text (Attempt ${attempts}/${maxRetries}):`, error.response ? error.response.data : error.message);

            if (attempts >= maxRetries) {
                translation = 'Error translating text. Please try again later.';
            }
        }
    }

    res.render('translate', { title: 'Translator', translatedText: translation });
});


app.get('/about', (req, res) => {
    res.render('about', { title: 'About' });
});

app.listen(port, () => {
    console.log(`Language Learning Tool app listening at http://localhost:${port}`);
});