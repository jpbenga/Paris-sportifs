// bets-logic.js
import { db, betsRef, firebaseFunctions, ref } from './firebase-init.js';

// État global
let bets = [];
let mise = 10;
let isSyncing = false;
let currentSession = null;
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
    let projection = mise;
    return Array.from({ length: 10 }, (_, i) => {
        projection *= 1.7;
        return Math.round(projection * 100) / 100;
    });
}

// Gestion du statut de synchronisation
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

// Gestion des sessions
async function startNewSession() {
    if (currentSession) {
        if (!confirm('Une session est déjà en cours. Voulez-vous vraiment en démarrer une nouvelle ?')) {
            return;
        }
        await endCurrentSession(SESSION_STATUS.ABANDONED);
    }

    currentSession = {
        id: generateId(),
        startDate: new Date().toISOString(),
        status: SESSION_STATUS.IN_PROGRESS,
        bets: [],
        initialAmount: mise,
        currentAmount: mise,
        maxStep: 0
    };

    await saveCurrentSession();
    updateSessionsDisplay();
}

async function endCurrentSession(status) {
    if (!currentSession) return;

    currentSession.endDate = new Date().toISOString();
    currentSession.status = status;
    currentSession.bets = [...bets];

    const sessions = await loadSessions();
    sessions.push({...currentSession});
    await saveSessions(sessions);

    currentSession = null;
    bets = [];
    await saveToServer();
    await saveCurrentSession();
    updateSessionsDisplay();
    updateBetsList();
    updateProjections();
    updateStats();
}

async function loadSessions() {
    try {
        const snapshot = await firebaseFunctions.get(sessionsRef);
        return snapshot.val() || [];
    } catch (error) {
        console.error('Erreur lors du chargement des sessions:', error);
        return [];
    }
}

async function saveSessions(sessions) {
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

function updateSessionsDisplay() {
    const container = document.getElementById('sessions-container');
    if (!container) return;

    let html = '<div class="space-y-4">';
    
    // Affichage de la session courante
    if (currentSession) {
        html += `
            <div class="bg-white/90 rounded-xl p-6 shadow-lg border border-indigo-100">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-semibold text-gray-800">Session en cours</h3>
                    <div class="flex gap-2">
                        <button onclick="window.endSession('${SESSION_STATUS.SUCCESS}')" 
                                class="px-3 py-1 bg-green-100 text-green-700 rounded-full hover:bg-green-200">
                            Réussie
                        </button>
                        <button onclick="window.endSession('${SESSION_STATUS.FAILED}')"
                                class="px-3 py-1 bg-red-100 text-red-700 rounded-full hover:bg-red-200">
                            Échouée
                        </button>
                        <button onclick="window.endSession('${SESSION_STATUS.ABANDONED}')"
                                class="px-3 py-1 bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200">
                            Abandonner
                        </button>
                    </div>
                </div>
                <div class="grid grid-cols-3 gap-4">
                    <div class="bg-white/50 p-4 rounded-lg">
                        <div class="text-sm text-gray-600">Mise initiale</div>
                        <div class="text-lg font-semibold">${currentSession.initialAmount}€</div>
                    </div>
                    <div class="bg-white/50 p-4 rounded-lg">
                        <div class="text-sm text-gray-600">Montant actuel</div>
                        <div class="text-lg font-semibold">${currentSession.currentAmount}€</div>
                    </div>
                    <div class="bg-white/50 p-4 rounded-lg">
                        <div class="text-sm text-gray-600">Étape</div>
                        <div class="text-lg font-semibold">${currentSession.maxStep}/10</div>
                    </div>
                </div>
            </div>`;
    }

    html += `
        <div class="flex justify-between items-center">
            <h3 class="text-xl font-semibold text-gray-800">Sessions</h3>
            ${!currentSession ? `
                <button onclick="window.startNewSession()" 
                        class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                    Nouvelle Session
                </button>
            ` : ''}
        </div>`;

    container.innerHTML = html;
}

// Gestion des paris
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

function updateBetsList() {
    const betsListDiv = document.getElementById('betsList');
    if (!betsListDiv) return;

    betsListDiv.innerHTML = bets.map((bet, index) => `
        <div class="glass-effect rounded-xl p-6 shadow-lg border border-indigo-100 mb-4">
            <div class="flex justify-between items-start">
                <div class="flex-1">
                    <div class="flex items-center gap-2 mb-2">
                        <h3 class="text-lg font-semibold text-gray-800">Pari #${index + 1}</h3>
                        <div class="flex gap-2">
                            ${bet.status === STATUS.PENDING ? `
                                <button onclick="window.updateBetStatus('${bet.id}', '${STATUS.WON}')" 
                                        class="text-sm px-3 py-1 bg-green-100 text-green-700 rounded-full hover:bg-green-200">
                                    Gagné
                                </button>
                                <button onclick="window.updateBetStatus('${bet.id}', '${STATUS.LOST}')"
                                        class="text-sm px-3 py-1 bg-red-100 text-red-700 rounded-full hover:bg-red-200">
                                    Perdu
                                </button>
                            ` : bet.status === STATUS.WON ?
                                '<span class="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">Gagné</span>' :
                                '<span class="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm">Perdu</span>'
                            }
                        </div>
                    </div>
                    <div class="space-y-1">
                        <p class="text-sm text-gray-600">
                            <span class="font-medium">Match 1:</span> 
                            ${bet.match1.description} 
                            <span class="text-indigo-600 font-medium">(${bet.match1.cote})</span>
                        </p>
                        ${bet.match2.description ? `
                            <p class="text-sm text-gray-600">
                                <span class="font-medium">Match 2:</span> 
                                ${bet.match2.description} 
                                <span class="text-indigo-600 font-medium">(${bet.match2.cote})</span>
                            </p>
                        ` : ''}
                        <p class="text-sm font-medium text-gray-800">
                            Cote totale: <span class="text-indigo-600">${bet.totalOdd}</span>
                        </p>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button onclick="window.deleteBet('${bet.id}')"
                            class="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">
                        🗑️
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

async function updateBetStatus(betId, status) {
    const betIndex = bets.findIndex(b => b.id === betId);
    if (betIndex !== -1) {
        bets[betIndex].status = status;
        
        if (currentSession) {
            const wonBets = bets.filter(b => b.status === STATUS.WON);
            currentSession.maxStep = wonBets.length;
            currentSession.currentAmount = wonBets.reduce((acc, bet) => 
                acc * parseFloat(bet.totalOdd), currentSession.initialAmount
            );
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

// Mise à jour des statistiques
function updateStats() {
    const wonBets = bets.filter(b => b.status === STATUS.WON).length;
    const lostBets = bets.filter(b => b.status === STATUS.LOST).length;
    
    const statsWon = document.getElementById('statsWon');
    const statsLost = document.getElementById('statsLost');
    
    if (statsWon) statsWon.textContent = wonBets;
    if (statsLost) statsLost.textContent = lostBets;
}

// Mise à jour des projections
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

// Synchronisation et sauvegarde
async function syncData() {
    if (isSyncing) return;
    isSyncing = true;
    setSyncStatus('Synchronisation...');
    
    try {
        const [betsSnapshot, currentSessionSnapshot] = await Promise.all([
            firebaseFunctions.get(betsRef),
            firebaseFunctions.get(ref(db, 'currentSession'))
        ]);

        const betsData = betsSnapshot.val();
        if (betsData) {
            bets = betsData.bets || [];
            mise = betsData.mise || 10;
            const miseInput = document.getElementById('miseInitiale');
            if (miseInput) miseInput.value = mise;
        }

        currentSession = currentSessionSnapshot.val();
        
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
    await syncData();
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
