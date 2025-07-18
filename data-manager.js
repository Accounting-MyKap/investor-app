const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// =================================================================
// --- ESQUEMAS ---
// =================================================================

// Esquema para Usuarios
const userSchema = new mongoose.Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true, select: false },
    role: { type: String, required: true, default: 'Processor' }
});

userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

// Esquema para Fondeadores (antes Inversores)
const lenderSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true }
});

// Esquema para Aportes de Capital
const portfolioLoanSchema = new mongoose.Schema({
    lenderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lender', required: true },
    initialAmount: { type: Number, required: true },
    availableAmount: { type: Number, required: true },
    date: { type: Date, default: Date.now }
});

// Esquema para Documentos dentro de un Prospecto
const documentSchema = new mongoose.Schema({
    name: { type: String, required: true },
    status: { type: String, enum: ['Pending', 'Received', 'Approved', 'Rejected'], default: 'Pending' }
});

// Esquema para Prospectos de Préstamo
const prospectSchema = new mongoose.Schema({
    clientName: { type: String, required: true },
    email: { type: String, required: true },
    phoneNumber: { type: String },
    loanAmount: { type: Number, required: true },
    borrowerType: { type: String, enum: ['Individual', 'Company'], required: true },
    loanType: { type: String, enum: ['Purchase', 'Refinance'], required: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: {
        type: String,
        required: true,
        enum: [ 'Prospect', 'Pre-validation', 'KYC', 'Title Work', 'Underwriting', 'Appraisal', 'Closing', 'Funded', 'Denied', 'On Hold' ],
        default: 'Pre-validation'
    },
    documents: [documentSchema]
}, { timestamps: true });

// Esquema para Créditos (Préstamos ya desembolsados)
const creditSchema = new mongoose.Schema({
    prospectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Prospect' },
    clientName: { type: String, required: true },
    totalAmount: { type: Number, required: true },
    disbursementDate: { type: Date, default: Date.now }
});

// Esquema para Asignaciones de Capital
const investmentSchema = new mongoose.Schema({
    amount: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    creditId: { type: mongoose.Schema.Types.ObjectId, ref: 'Credit', required: true },
    lenderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lender', required: true }
});


// =================================================================
// --- MODELOS ---
// =================================================================

const User = mongoose.model('User', userSchema);
const Lender = mongoose.model('Lender', lenderSchema);
const Portfolio = mongoose.model('Portfolio', portfolioLoanSchema);
const Prospect = mongoose.model('Prospect', prospectSchema);
const Credit = mongoose.model('Credit', creditSchema);
const Investment = mongoose.model('Investment', investmentSchema);

// =================================================================
// --- FUNCIONES ---
// =================================================================

// --- Funciones de Usuario ---
async function registerUser(firstName, lastName, email, password, role) {
    const newUser = new User({ firstName, lastName, email, password, role });
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
    return await User.findById(id);
}
async function getAllUsers() {
    return await User.find();
}

// --- Funciones de Lenders (Fondeadores) ---
async function addLender(name, email) {
    const newLender = new Lender({ name, email });
    return await newLender.save();
}
async function getAllLenders() {
    return await Lender.find();
}
async function getLenderById(id) {
    return await Lender.findById(id);
}

// --- Funciones de Portfolio Loans ---
async function addPortfolioLoan(lenderId, amount) {
    const newPortfolioLoan = new Portfolio({ lenderId, initialAmount: amount, availableAmount: amount });
    return await newPortfolioLoan.save();
}
async function getPortfolioLoansByLender(lenderId) {
    return await Portfolio.find({ lenderId: lenderId });
}
async function getAvailablePortfolioLoans() {
    return await Portfolio.find({ availableAmount: { $gt: 0 } }).populate('lenderId');
}

// --- Funciones de Prospects ---
async function addProspect(prospectData) {
    const newProspect = new Prospect(prospectData);
    return await newProspect.save();
}
async function getAllProspects() {
    return await Prospect.find().sort({ createdAt: -1 }).populate('assignedTo');
}
async function getProspectById(id) {
    return await Prospect.findById(id).populate('assignedTo');
}
async function updateProspectStatus(id, newStatus) {
    return await Prospect.findByIdAndUpdate(id, { status: newStatus }, { new: true });
}

// --- Funciones de Créditos ---
async function addCredit(clientName, totalAmount) {
    const newCredit = new Credit({ clientName, totalAmount });
    return await newCredit.save();
}
async function getAllCredits() {
    return await Credit.find();
}
async function getCreditById(id) {
    return await Credit.findById(id);
}
async function updateCredit(id, updates) {
    return await Credit.findByIdAndUpdate(id, updates, { new: true });
}

// --- Funciones de Inversiones (Asignaciones) ---
async function getInvestmentsByCredit(creditId) {
    return await Investment.find({ creditId: creditId }).populate('lenderId');
}
async function getInvestmentById(id) {
    return await Investment.findById(id);
}
async function deleteInvestment(id) {
    return await Investment.findByIdAndDelete(id);
}
async function addInvestment(creditId, portfolioLoanId, amount) {
    const credit = await Credit.findById(creditId);
    const portfolio = await Portfolio.findById(portfolioLoanId);
    if (!credit || !portfolio) throw new Error("Credit or Portfolio Loan not found.");
    if (amount > portfolio.availableAmount) throw new Error("Insufficient funds in the portfolio loan.");
    const existingInvestments = await Investment.find({ creditId: creditId });
    const currentFundedAmount = existingInvestments.reduce((sum, inv) => sum + inv.amount, 0);
    if (currentFundedAmount + amount > credit.totalAmount) throw new Error("Assignment exceeds the total credit amount.");
    
    portfolio.availableAmount -= amount;
    await portfolio.save();
    
    const newInvestment = new Investment({
        amount: amount,
        creditId: creditId,
        lenderId: portfolio.lenderId
    });
    return await newInvestment.save();
}

// =================================================================
// --- EXPORTACIÓN DE MÓDULOS ---
// =================================================================
module.exports = {
    // Users
    registerUser,
    loginUser,
    getUserById,
    getAllUsers,

    // Lenders
    addLender,
    getAllLenders,
    getLenderById,

    // Portfolio Loans
    addPortfolioLoan,
    getPortfolioLoansByLender,
    getAvailablePortfolioLoans,
    
    // Prospects
    addProspect,
    getAllProspects,
    getProspectById,
    updateProspectStatus,

    // Credits
    addCredit,
    getAllCredits,
    getCreditById,
    updateCredit,

    // Investments
    getInvestmentsByCredit,
    getInvestmentById,
    deleteInvestment,
    addInvestment
};