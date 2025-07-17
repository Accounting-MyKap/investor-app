// VERSIÓN COMPLETA Y CORREGIDA - JULIO 17
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

// --- Database Connection ---
mongoose.connect(process.env.DATABASE_URL)
  .then(() => console.log("✅ Connection to MongoDB Atlas successful."))
  .catch((error) => console.error("❌ Error connecting to MongoDB:", error));

// --- Express & Middleware Configuration ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// --- Session Configuration ---
app.use(session({
    secret: 'a-very-strong-secret-to-sign-the-cookie',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.DATABASE_URL })
}));



// Middleware to load user data on each request if logged in
app.use(async (req, res, next) => {
    if (req.session.userId) {
        res.locals.currentUser = await dataManager.getUserById(req.session.userId);
    }
    next();
});

const isAuthenticated = (req, res, next) => {
    if (req.session.userId) { return next(); }
    res.redirect('/login');
};

// =================================================================
// APPLICATION ROUTES
// =================================================================

// --- Authentication Routes (Public) ---
app.get('/register', (req, res) => {
    res.render('register');
});

app.post('/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        await dataManager.registerUser(email, password);
        res.redirect('/login');
    } catch (error) {
        console.error("--- ERROR REAL AL REGISTRAR ---", error);
        res.status(500).send("Error al registrar el usuario. El email puede que ya esté en uso.");
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


// --- Application Routes (Protected) ---

app.get('/', isAuthenticated, async (req, res) => {
    try {
        const allCredits = await dataManager.getAllCredits();
        res.render('index', { pageTitle: 'Dashboard de Créditos', credits: allCredits });
    } catch (error) {
        res.status(500).send("Error al obtener los créditos.");
    }
});

app.get('/investors', isAuthenticated, async (req, res) => {
    try {
        const allInvestors = await dataManager.getAllInvestors();
        res.render('investors', { pageTitle: 'Gestión de Inversores', investors: allInvestors });
    } catch (error) {
        res.status(500).send("Error al obtener los inversores.");
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

app.post('/investor', isAuthenticated, async (req, res) => {
    try {
        const { name, email } = req.body;
        if (name && email) {
            await dataManager.addInvestor(name, email);
        }
        res.redirect('/investors');
    } catch (error) {
        res.status(500).send("Error al crear el inversor.");
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

// --- Server Initialization ---
app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
});