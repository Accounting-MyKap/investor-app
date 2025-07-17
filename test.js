const dataManager = require('./data-manager.js');

console.log("--- PRUEBA DE ACTUALIZACIÓN Y ELIMINACIÓN ---");

// --- Probando updateCredit ---
console.log("\n1. Actualizando el crédito 'CR-001'...");
const updates = { 
    clientName: "Constructora Horizonte S.A.S.",
    totalAmount: 120000 
};
const updateResult = dataManager.updateCredit("CR-001", updates);
console.log("Respuesta de la actualización:", updateResult);


// --- Probando deleteInvestment ---
console.log("\n2. Eliminando la inversión 'T-001'...");
// Primero, vemos cuántas inversiones hay para el crédito CR-001
let investmentsBefore = dataManager.getInvestmentsByCredit("CR-001");
console.log(`Inversiones para CR-001 antes de eliminar: ${investmentsBefore.length}`);

// Ahora, la eliminamos
const deleteResult = dataManager.deleteInvestment("T-001");
console.log("Respuesta de la eliminación:", deleteResult.message);

// Verificamos de nuevo
let investmentsAfter = dataManager.getInvestmentsByCredit("CR-001");
console.log(`Inversiones para CR-001 después de eliminar: ${investmentsAfter.length}`);
console.log("Lista final de inversiones para CR-001:", investmentsAfter);

// --- Verificación Final ---
console.log("\n3. Estado final de todos los créditos...");
console.log(dataManager.getAllCredits());