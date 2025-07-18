// =================================================================
// --- IMPORTS AND INITIAL SETUP ---
// =================================================================

console.log("--- INICIANDO SERVIDOR, VERSIÓN COMPLETA ---");

require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const dataManager = require('./data-manager.js');


const app = express();
const port = 3000;

// =================================================================
// --- DATABASE CONNECTION ---
// =================================================================

mongoose.connect(process.env.DATABASE_URL)
  .then(() => console.log("✅ Connection to MongoDB Atlas successful."))
  .catch((error) => console.error("❌ Error connecting to MongoDB:", error));

// =================================================================
// --- MIDDLEWARE CONFIGURATION ---
// =================================================================

// 1. View Engine Setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 2. Body Parser for Forms
app.use(express.urlencoded({ extended: true }));

// 3. Static Files (for local development)
// This line serves files from the 'public' folder (like images).
// It's commented out as requested, because Vercel handles this in production.
// Uncomment it if you have issues seeing images on localhost.
// app.use(express.static(path.join(__dirname, 'public')));


// 4. Session Configuration
app.use(session({
    secret: 'a-very-strong-secret-to-sign-the-cookie',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.DATABASE_URL })
}));


// 5. Custom Middleware to Load User on Every Request
app.use(async (req, res, next) => {
    if (req.session.userId) {
        res.locals.currentUser = await dataManager.getUserById(req.session.userId);
    }
    next();
});

// 6. "Guardian" Middleware to Protect Routes
const isAuthenticated = (req, res, next) => {
    if (req.session.userId) { return next(); }
    res.redirect('/login');
};

// =================================================================
// --- AUTHENTICATION ROUTES (PUBLIC) ---
// =================================================================

app.get('/register', (req, res) => {
    res.render('register', { pageTitle: 'Sign Up' });
});

app.post('/register', async (req, res) => {
    try {
        const { firstName, lastName, email, password } = req.body;
        await dataManager.registerUser(firstName, lastName, email, password);
        res.redirect('/login');
    } catch (error) {
        res.status(500).send("Error registering user. The email may already be in use.");
    }
});

app.get('/login', (req, res) => {
    if (req.session.userId) { return res.redirect('/'); }
    res.render('login');
});

app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await dataManager.loginUser(email, password);
        if (user) {
            console.log("✅ Usuario encontrado y contraseña correcta. Creando sesión..."); // <-- MENSAJE DE ÉXITO
            req.session.userId = user._id;
            res.redirect('/');
        } else {
            console.log("❌ Usuario no encontrado o contraseña incorrecta."); // <-- MENSAJE DE FALLO
            res.redirect('/login');
        }
    } catch (error) {
         console.error("--- ERROR INESPERADO EN LOGIN ---", error); // <-- MENSAJE DE ERROR GRAVE
        res.redirect('/login');
    }
});

app.post('/logout', (req, res, next) => {
    // El método .destroy() elimina la sesión de la base de datos
    req.session.destroy((err) => {
        if (err) {
            // Si hay un error al destruir la sesión, lo pasamos al manejador de errores
            return next(err);
        }
        // Redirigimos al login una vez que la sesión ha sido destruida
        res.redirect('/login');
    });
});


// =================================================================
// --- CORE APPLICATION ROUTES (PROTECTED) ---
// =================================================================

app.get('/', isAuthenticated, async (req, res) => {
    try {
        const allCredits = await dataManager.getAllCredits();
        res.render('index', { pageTitle: 'Dashboard', credits: allCredits });
    } catch (error) {
        res.status(500).send("Error al obtener la vista Dashboard.");
    }
});

// --- Prospects Module ---
app.get('/prospects', isAuthenticated, async (req, res) => {
    try {
        const allProspects = await dataManager.getAllProspects();
        const allUsers = await dataManager.getAllUsers();
        res.render('prospects', { 
            pageTitle: 'Prospects', 
            prospects: allProspects,
            users: allUsers 
        });
    } catch (error) {
        res.status(500).send("Error fetching prospects.");
    }
});

app.get('/prospects/:id', isAuthenticated, async (req, res) => {
    try {
        const prospect = await dataManager.getProspectById(req.params.id);
        if (!prospect) { return res.status(404).send("Prospect not found"); }
        res.render('prospect-detail', { pageTitle: `Prospect: ${prospect.clientName}`, prospect });
    } catch (error) {
        res.status(500).send("Error fetching prospect details.");
    }
});

// --- Lenders Module (Formerly Investors) ---
app.get('/lenders', isAuthenticated, async (req, res) => {
    try {
        const allLenders = await dataManager.getAllLenders();
        res.render('lenders', { pageTitle: 'Lenders', lenders: allLenders });
    } catch (error) {
        res.status(500).send("Error fetching lenders.");
    }
});

app.get('/credit/:id', isAuthenticated, async (req, res) => {
    try {
        const creditId = req.params.id;
        const credit = await dataManager.getCreditById(creditId);
        const investments = await dataManager.getInvestmentsByCredit(creditId);
        const availablePortfolios = await dataManager.getAvailablePortfolioLoans();
        if (!credit) { return res.status(404).send("Crédito no encontrado"); }
        res.render('credit-detail', { credit, investments, portfolios: availablePortfolios });
    } catch (error) {
        res.status(500).send("Error al obtener el detalle del crédito.");
    }
});

app.get('/investor/:id', isAuthenticated, async (req, res) => {
    try {
        const investorId = req.params.id;
        const investor = await dataManager.getInvestorById(investorId);
        const portfolioLoans = await dataManager.getPortfolioLoansByInvestor(investorId);
        if (!investor) { return res.status(404).send("Inversor no encontrado"); }
        res.render('investor-detail', { investor, portfolioLoans });
    } catch (error) {
        res.status(500).send("Error al obtener el inversor.");
    }
});

app.get('/credit/edit/:id', isAuthenticated, async (req, res) => {
    try {
        const credit = await dataManager.getCreditById(req.params.id);
        if (!credit) { return res.status(404).send("Crédito no encontrado"); }
        res.render('edit-credit', { credit: credit });
    } catch (error) {
        res.status(500).send("Error al obtener el crédito para editar.");
    }
});

// --- Rutas POST (Protegidas) ---

app.post('/prospects', isAuthenticated, async (req, res) => {
    try {
        await dataManager.addProspect(req.body);
        res.redirect('/prospects');
    } catch (error) {
        res.status(500).send("Error creating prospect.");
    }
});

app.post('/credit', isAuthenticated, async (req, res) => {
    try {
        const { clientName, totalAmount } = req.body;
        if (clientName && totalAmount) {
            await dataManager.addCredit(clientName, parseFloat(totalAmount));
        }
        res.redirect('/');
    } catch (error) {
        res.status(500).send("Error al crear el crédito.");
    }
});

app.post('/lender', isAuthenticated, async (req, res) => {
    try {
        const { name, email } = req.body;
        if (name && email) {
            await dataManager.addLender(name, email);
        }
        res.redirect('/lenders');
    } catch (error) {
        res.status(500).send("Error creating lender.");
    }
});

app.post('/credit/update/:id', isAuthenticated, async (req, res) => {
    try {
        await dataManager.updateCredit(req.params.id, req.body);
        res.redirect(`/credit/${req.params.id}`);
    } catch (error) {
        res.status(500).send("Error al actualizar el crédito.");
    }
});

app.post('/portfolio-loan', isAuthenticated, async (req, res) => {
    try {
        const { investorId, amount } = req.body;
        if (investorId && amount) {
            await dataManager.addPortfolioLoan(investorId, parseFloat(amount));
        }
        res.redirect(`/investor/${investorId}`);
    } catch (error) {
        res.status(500).send("Error al registrar el portfolio loan.");
    }
});

app.post('/investment', isAuthenticated, async (req, res) => {
    try {
        const { creditId, portfolioLoanId, amount } = req.body;
        if (creditId && portfolioLoanId && amount) {
            await dataManager.addInvestment(creditId, portfolioLoanId, parseFloat(amount));
        }
        res.redirect(`/credit/${creditId}`);
    } catch (error) {
        res.status(500).send(`Error al crear la inversión: ${error.message}`);
    }
});

app.post('/investment/delete/:id', isAuthenticated, async (req, res) => {
    try {
        const investmentId = req.params.id;
        const investment = await dataManager.getInvestmentById(investmentId);
        if (investment) {
            await dataManager.deleteInvestment(investmentId);
            res.redirect(`/credit/${investment.creditId}`);
        } else {
            res.redirect('/');
        }
    } catch (error) {
        res.status(500).send("Error al eliminar la inversión.");
    }
});


// =================================================================
// --- SERVER INITIALIZATION ---
// =================================================================

app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
});