const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// =================================================================
// --- ESQUEMAS ---
// =================================================================

const userSchema = new mongoose.Schema({
    firstName: { type: String, required: true }, // <-- CAMBIADO
    lastName: { type: String, required: true },  // <-- AÑADIDO
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true, select: false },
    role: { type: String, required: true, default: 'Procesador' }
});

userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

const creditSchema = new mongoose.Schema({
    clientName: { type: String, required: true },
    totalAmount: { type: Number, required: true }
});

const investorSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true }
});

const portfolioLoanSchema = new mongoose.Schema({
    investorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Investor', required: true },
    initialAmount: { type: Number, required: true },
    availableAmount: { type: Number, required: true },
    date: { type: Date, default: Date.now }
});

const investmentSchema = new mongoose.Schema({
    amount: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    creditId: { type: mongoose.Schema.Types.ObjectId, ref: 'Credit', required: true },
    investorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Investor', required: true }
});

// =================================================================
// --- MODELOS ---
// =================================================================

const User = mongoose.model('User', userSchema);
const Credit = mongoose.model('Credit', creditSchema);
const Investor = mongoose.model('Investor', investorSchema);
const Portfolio = mongoose.model('Portfolio', portfolioLoanSchema);
const Investment = mongoose.model('Investment', investmentSchema);

// =================================================================
// --- FUNCIONES ---
// =================================================================

// --- Funciones de Usuario ---
async function registerUser(firstName, lastName, email, password, role) { // <-- CAMBIADO
    const newUser = new User({ firstName, lastName, email, password, role }); // <-- CAMBIADO
    return await newUser.save();
}

async function loginUser(email, password) {
    const user = await User.findOne({ email }).select('+password');
    if (!user) return null;
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return null;
    return user;
}

async function getUserById(id) {
    // Busca un usuario por su _id único de MongoDB.
    return await User.findById(id);
}

// --- Funciones de Créditos ---
async function addCredit(clientName, totalAmount) {
    const newCredit = new Credit({ clientName, totalAmount });
    return await newCredit.save();
}
async function getAllCredits() { return await Credit.find(); }
async function getCreditById(id) { return await Credit.findById(id); }
async function updateCredit(id, updates) { return await Credit.findByIdAndUpdate(id, updates, { new: true }); }

// --- Funciones de Inversores ---
async function addInvestor(name, email) {
    const newInvestor = new Investor({ name, email });
    return await newInvestor.save();
}
async function getAllInvestors() { return await Investor.find(); }
async function getInvestorById(id) { return await Investor.findById(id); }

// --- Funciones de Portfolio Loans ---
async function addPortfolioLoan(investorId, amount) {
    const newPortfolioLoan = new Portfolio({ investorId, initialAmount: amount, availableAmount: amount });
    return await newPortfolioLoan.save();
}
async function getPortfolioLoansByInvestor(investorId) { return await Portfolio.find({ investorId: investorId }); }
async function getAvailablePortfolioLoans() { return await Portfolio.find({ availableAmount: { $gt: 0 } }).populate('investorId'); }

// --- Funciones de Inversiones (Asignaciones) ---
async function getInvestmentsByCredit(creditId) { return await Investment.find({ creditId: creditId }).populate('investorId'); }
async function getInvestmentById(id) { return await Investment.findById(id); }
async function deleteInvestment(id) { return await Investment.findByIdAndDelete(id); }
async function addInvestment(creditId, portfolioLoanId, amount) {
    const credit = await Credit.findById(creditId);
    const portfolio = await Portfolio.findById(portfolioLoanId);
    if (!credit || !portfolio) throw new Error("El crédito o el portfolio loan no existen.");
    if (amount > portfolio.availableAmount) throw new Error("Fondos insuficientes en el portfolio loan.");
    const existingInvestments = await Investment.find({ creditId: creditId });
    const currentFundedAmount = existingInvestments.reduce((sum, inv) => sum + inv.amount, 0);
    if (currentFundedAmount + amount > credit.totalAmount) throw new Error("La asignación supera el monto total del crédito.");
    portfolio.availableAmount -= amount;
    await portfolio.save();
    const newInvestment = new Investment({
        amount: amount,
        creditId: creditId,
        investorId: portfolio.investorId
    });
    return await newInvestment.save();
}

// =================================================================
// --- EXPORTACIÓN DE MÓDULOS ---
// =================================================================
module.exports = {

    //funciones de usuario
    registerUser,
    loginUser,
    getUserById,

    //Funciones de créditos
    addCredit,
    getAllCredits,
    getCreditById,
    updateCredit,

    //Funciones de inversores
    addInvestor,
    getAllInvestors,
    getInvestorById,

    //Funciones de portfolio loans
    addPortfolioLoan,
    getPortfolioLoansByInvestor,
    getAvailablePortfolioLoans,

    //Funciones de inversiones (asignaciones)
    getInvestmentsByCredit,
    getInvestmentById,
    deleteInvestment,

    // Logica del negocio
    addInvestment
};