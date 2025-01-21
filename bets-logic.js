// bets-logic.js
import { db, betsRef, firebaseFunctions, ref } from './firebase-init.js';

// État global
let bets = [];
let mise = 10;
let isSyncing = false;
let currentSession = null;
let sessions = [];
const sessionsRef = ref(db, 'sessions');

// Constantes pour les statuts
const STATUS = {
    PENDING: 'pending',
    WON: 'won',
    LOST: 'lost'
};

const SESSION_STATUS = {
    IN_PROGRESS: 'in_progress',
    SUCCESS: 'success',
    FAILED: 'failed',
    ABANDONED: 'abandoned'
};

// Utilitaires
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function validateIndividualOdd(odd) {
    const numOdd = parseFloat(odd);
    return numOdd >= 1.25 && numOdd <= 1.82;
}

function validateOdds(match1, match2) {
    if (!match1) return false;
    const totalOdds = match2 ? match1 * match2 : match1;
    return totalOdds >= 1.58 && totalOdds <= 1.87;
}

function calculateProjections() {
    const startAmount = currentSession ? currentSession.initialAmount : mise;
    let projection = startAmount;
    return Array.from({ length: 10 }, (_, i) => {
        projection *= 1.7;
        return Math.round(projection * 100) / 100;
    });
}

function setSyncStatus(status, isError = false) {
    const statusElement = document.getElementById('syncStatus');
    const syncButton = document.getElementById('syncButton');
    
    if (!statusElement || !syncButton) return;
    
    statusElement.textContent = status;
    statusElement.className = `text-sm px-3 py-1 rounded-full ${
        isError ? 'bg-red-500/20 text-red-100' :
        status === 'Synchronisation...' ? 'bg-yellow-500/20 text-yellow-100' :
        'bg-white/20 text-white'
    }`;
    
    syncButton.classList.toggle('sync-spinner', status === 'Synchronisation...');
}

// Gestion des Sessions
async function startNewSession() {
    if (currentSession) {
        if (!confirm('Une session est déjà en cours. Voulez-vous vraiment en démarrer une nouvelle ?')) {
            return;
        }
        await endCurrentSession(SESSION_STATUS.ABANDONED);
    }

    const initialAmount = parseFloat(prompt("Entrez le montant initial de votre session :", "10"));
    if (!initialAmount || isNaN(initialAmount) || initialAmount <= 0) {
        alert("Veuillez entrer un montant initial valide");
        return;
    }

    currentSession = {
        id: generateId(),
        startDate: new Date().toISOString(),
        status: SESSION_STATUS.IN_PROGRESS,
        bets: [],
        initialAmount: initialAmount,
        currentAmount: initialAmount,
        maxStep: 0
    };

    // Mettre à jour l'affichage
    mise = initialAmount;
    const miseInput = document.getElementById('miseInitiale');
    if (miseInput) miseInput.value = initialAmount;

    await saveCurrentSession();
    updateSessionsDisplay();
    updateProjections();
}

async function endCurrentSession(status) {
    if (!currentSession) return;

    currentSession.endDate = new Date().toISOString();
    currentSession.status = status;
    currentSession.bets = [...bets];

    sessions.push({...currentSession});
    await saveSessions();
    
    currentSession = null;
    bets = [];
    await Promise.all([
        saveToServer(),
        saveCurrentSession()
    ]);

    updateSessionsDisplay();
    updateBetsList();
    updateProjections();
    updateStats();
}

async function loadSessions() {
    try {
        const [sessionsSnapshot, currentSessionSnapshot] = await Promise.all([
            firebaseFunctions.get(sessionsRef),
            firebaseFunctions.get(ref(db, 'currentSession'))
        ]);

        if (sessionsSnapshot.exists()) {
            sessions = sessionsSnapshot.val() || [];
        }

        if (currentSessionSnapshot.exists()) {
            currentSession = currentSessionSnapshot.val();
            if (currentSession) {
                mise = currentSession.initialAmount;
                const miseInput = document.getElementById('miseInitiale');
                if (miseInput) miseInput.value = mise;
            }
        }

        updateSessionsDisplay();
        updateProjections();
    } catch (error) {
        console.error('Erreur lors du chargement des sessions:', error);
    }
}

async function saveSessions() {
    try {
        await firebaseFunctions.set(sessionsRef, sessions);
    } catch (error) {
        console.error('Erreur lors de la sauvegarde des sessions:', error);
    }
}

async function saveCurrentSession() {
    try {
        await firebaseFunctions.set(ref(db, 'currentSession'), currentSession);
    } catch (error) {
        console.error('Erreur lors de la sauvegarde de la session courante:', error);
    }
}

// Gestion des Paris
async function addBet() {
    if (!currentSession) {
        alert('Veuillez démarrer une nouvelle session avant d\'ajouter un pari.');
        return;
    }

    const match1 = {
        description: document.getElementById('match1Description').value,
        cote: parseFloat(document.getElementById('match1Cote').value)
    };
    
    const match2 = {
        description: document.getElementById('match2Description').value,
        cote: document.getElementById('match2Cote').value ? parseFloat(document.getElementById('match2Cote').value) : null
    };

    if (!match1.description || !match1.cote) {
        alert('Veuillez remplir les informations du Match 1');
        return;
    }

    if (!validateIndividualOdd(match1.cote) || (match2.cote && !validateIndividualOdd(match2.cote))) {
        alert('Les cotes individuelles doivent être entre 1,25 et 1,82');
        return;
    }

    if (!validateOdds(match1.cote, match2.cote)) {
        alert('La cote totale doit être entre 1,58 et 1,87');
        return;
    }

    const totalOdd = match2.cote ? (match1.cote * match2.cote).toFixed(2) : match1.cote.toFixed(2);
    
    const newBet = {
        id: generateId(),
        match1,
        match2,
        totalOdd,
        status: STATUS.PENDING,
        timestamp: Date.now()
    };

    bets.push(newBet);
    currentSession.bets = [...bets];

    // Reset du formulaire
    document.getElementById('match1Description').value = '';
    document.getElementById('match1Cote').value = '';
    document.getElementById('match2Description').value = '';
    document.getElementById('match2Cote').value = '';

    // Mise à jour de l'interface
    updateBetsList();
    updateProjections();
    updateStats();
    
    await Promise.all([
        saveToServer(),
        saveCurrentSession()
    ]);
}

async function updateBetStatus(betId, status) {
    const betIndex = bets.findIndex(b => b.id === betId);
    if (betIndex !== -1) {
        bets[betIndex].status = status;
        
        if (currentSession) {
            const wonBets = bets.filter(b => b.status === STATUS.WON);
            currentSession.maxStep = wonBets.length;
            
            // Calculer le montant actuel basé sur le montant initial
            let amount = currentSession.initialAmount;
            for (const bet of wonBets) {
                amount *= parseFloat(bet.totalOdd);
            }
            currentSession.currentAmount = Math.round(amount * 100) / 100;
            currentSession.bets = [...bets];

            if (status === STATUS.LOST) {
                await endCurrentSession(SESSION_STATUS.FAILED);
                return;
            }

            if (currentSession.maxStep === 10) {
                await endCurrentSession(SESSION_STATUS.SUCCESS);
                return;
            }

            await saveCurrentSession();
        }

        updateBetsList();
        updateProjections();
        updateStats();
        await saveToServer();
    }
}

async function deleteBet(betId) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce pari ?')) {
        return;
    }

    bets = bets.filter(b => b.id !== betId);
    if (currentSession) {
        currentSession.bets = [...bets];
        await saveCurrentSession();
    }

    updateBetsList();
    updateProjections();
    updateStats();
    await saveToServer();
}

// Fonctions de mise à jour de l'interface
function updateStats() {
    const wonBets = bets.filter(b => b.status === STATUS.WON).length;
    const lostBets = bets.filter(b => b.status === STATUS.LOST).length;
    
    const statsWon = document.getElementById('statsWon');
    const statsLost = document.getElementById('statsLost');
    
    if (statsWon) statsWon.textContent = wonBets;
    if (statsLost) statsLost.textContent = lostBets;
}

function updateProjections() {
    const projectionsDiv = document.getElementById('projections');
    if (!projectionsDiv) return;

    const wonBets = bets.filter(b => b.status === STATUS.WON).length;
    const projections = calculateProjections();

    projectionsDiv.innerHTML = projections.map((proj, i) => `
        <div class="projection-card p-3 rounded-xl text-center shadow-sm ${
            i < wonBets
                ? 'bg-gradient-to-br from-emerald-400 to-green-500 text-white'
                : i === wonBets
                ? 'bg-gradient-to-br from-violet-500 to-purple-600 text-white ring-2 ring-purple-200'
                : 'bg-white/80 text-gray-800'
        }">
            <div class="text-xs font-medium">Étape</div>
            <div class="text-xl font-bold mb-1">#${i + 1}</div>
            <div class="font-semibold">${proj}€</div>
        </div>
    `).join('');
}

[RESTE DE LA FONCTION updateSessionsDisplay ICI]

// Synchronisation et sauvegarde
async function syncData() {
    if (isSyncing) return;
    isSyncing = true;
    setSyncStatus('Synchronisation...');
    
    try {
        const [betsSnapshot, currentSessionSnapshot, sessionsSnapshot] = await Promise.all([
            firebaseFunctions.get(betsRef),
            firebaseFunctions.get(ref(db, 'currentSession')),
            firebaseFunctions.get(sessionsRef)
        ]);

        const betsData = betsSnapshot.val();
        if (betsData) {
            bets = betsData.bets || [];
            mise = betsData.mise || 10;
            const miseInput = document.getElementById('miseInitiale');
            if (miseInput) miseInput.value = mise;
        }

        if (currentSessionSnapshot.exists()) {
            currentSession = currentSessionSnapshot.val();
        }

        if (sessionsSnapshot.exists()) {
            sessions = sessionsSnapshot.val() || [];
        }
        
        updateBetsList();
        updateProjections();
        updateStats();
        updateSessionsDisplay();
        setSyncStatus('Synchronisé');
    } catch (error) {
        console.error('Erreur de synchronisation:', error);
        setSyncStatus('Erreur de sync', true);
    } finally {
        isSyncing = false;
    }
}

async function saveToServer() {
    setSyncStatus('Sauvegarde...');
    try {
        await firebaseFunctions.set(betsRef, {
            bets,
            mise
        });
        setSyncStatus('Synchronisé');
    } catch (error) {
        console.error('Erreur de sauvegarde:', error);
        setSyncStatus('Erreur de sauvegarde', true);
    }
}

// Initialisation
async function initializeBets() {
    await Promise.all([
        syncData(),
        loadSessions()
    ]);
}

// Exposition des fonctions globales
window.startNewSession = startNewSession;
window.endSession = endCurrentSession;
window.addBet = addBet;
window.updateBetStatus = updateBetStatus;
window.deleteBet = deleteBet;
window.syncData = syncData;

// Export des fonctions pour les modules
export {
    initializeBets,
    syncData,
    saveToServer,
    startNewSession,
    endCurrentSession,
    addBet,
    updateBetStatus,
    deleteBet,
    STATUS,
    SESSION_STATUS
};
