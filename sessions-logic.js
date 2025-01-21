// sessions-logic.js
import { db, firebaseFunctions, ref } from './firebase-init.js';

let currentSession = null;
let sessions = [];
const sessionsRef = ref(db, 'sessions');

// Statuts possibles d'une session
const SESSION_STATUS = {
    IN_PROGRESS: 'in_progress',
    SUCCESS: 'success',
    FAILED: 'failed',
    ABANDONED: 'abandoned'
};

// Créer une nouvelle session
export async function startNewSession() {
    if (currentSession) {
        if (!confirm('Une session est déjà en cours. Voulez-vous vraiment en démarrer une nouvelle ?')) {
            return;
        }
        await endCurrentSession(SESSION_STATUS.ABANDONED);
    }

    currentSession = {
        id: Date.now().toString(),
        startDate: new Date().toISOString(),
        status: SESSION_STATUS.IN_PROGRESS,
        bets: [],
        initialAmount: parseFloat(document.getElementById('miseInitiale').value) || 10,
        currentAmount: parseFloat(document.getElementById('miseInitiale').value) || 10,
        maxStep: 0
    };

    await saveCurrentSession();
    updateSessionsDisplay();
}

// Terminer la session courante
export async function endCurrentSession(status) {
    if (!currentSession) return;

    currentSession.endDate = new Date().toISOString();
    currentSession.status = status;
    
    sessions.push({...currentSession});
    await saveSessions();
    
    currentSession = null;
    await saveCurrentSession();
    updateSessionsDisplay();
}

// Sauvegarder la session courante
async function saveCurrentSession() {
    try {
        await firebaseFunctions.set(ref(db, 'currentSession'), currentSession);
    } catch (error) {
        console.error('Erreur lors de la sauvegarde de la session courante:', error);
    }
}

// Sauvegarder toutes les sessions
async function saveSessions() {
    try {
        await firebaseFunctions.set(sessionsRef, sessions);
    } catch (error) {
        console.error('Erreur lors de la sauvegarde des sessions:', error);
    }
}

// Charger les sessions depuis Firebase
export async function loadSessions() {
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
        }

        updateSessionsDisplay();
    } catch (error) {
        console.error('Erreur lors du chargement des sessions:', error);
    }
}

// Mettre à jour l'affichage des sessions
function updateSessionsDisplay() {
    const container = document.getElementById('sessions-container');
    if (!container) return;

    // Affichage de la session courante
    let html = '<div class="space-y-4">';
    
    if (currentSession) {
        html += `
            <div class="bg-white/90 rounded-xl p-6 shadow-lg border border-indigo-100">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-semibold text-gray-800">Session en cours</h3>
                    <div class="flex gap-2">
                        <button onclick="window.endCurrentSession('${SESSION_STATUS.SUCCESS}')" 
                                class="px-3 py-1 bg-green-100 text-green-700 rounded-full hover:bg-green-200">
                            Réussie
                        </button>
                        <button onclick="window.endCurrentSession('${SESSION_STATUS.FAILED}')"
                                class="px-3 py-1 bg-red-100 text-red-700 rounded-full hover:bg-red-200">
                            Échouée
                        </button>
                        <button onclick="window.endCurrentSession('${SESSION_STATUS.ABANDONED}')"
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

    // En-tête de l'historique
    html += `
        <div class="flex justify-between items-center">
            <h3 class="text-xl font-semibold text-gray-800">Historique des sessions</h3>
            <button onclick="window.startNewSession()" 
                    class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                Nouvelle Session
            </button>
        </div>`;

    // Liste des sessions terminées
    if (sessions.length === 0) {
        html += '<p class="text-center text-gray-600 py-4">Aucune session terminée</p>';
    } else {
        sessions.forEach(session => {
            const statusColors = {
                [SESSION_STATUS.SUCCESS]: 'bg-green-100 text-green-800',
                [SESSION_STATUS.FAILED]: 'bg-red-100 text-red-800',
                [SESSION_STATUS.ABANDONED]: 'bg-gray-100 text-gray-800'
            };

            const statusLabels = {
                [SESSION_STATUS.SUCCESS]: 'Réussie',
                [SESSION_STATUS.FAILED]: 'Échouée',
                [SESSION_STATUS.ABANDONED]: 'Abandonnée'
            };

            html += `
                <div class="bg-white/90 rounded-xl p-6 shadow-lg border border-indigo-100 mt-4">
                    <div class="flex justify-between items-start mb-4">
                        <div>
                            <span class="px-2 py-1 rounded-full text-sm ${statusColors[session.status]}">
                                ${statusLabels[session.status]}
                            </span>
                            <p class="text-sm text-gray-600 mt-2">
                                Du ${new Date(session.startDate).toLocaleString()} 
                                au ${new Date(session.endDate).toLocaleString()}
                            </p>
                        </div>
                        <div class="text-right">
                            <div class="text-sm text-gray-600">Étape atteinte</div>
                            <div class="text-xl font-bold">${session.maxStep}/10</div>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="bg-gray-50 p-3 rounded-lg">
                            <div class="text-sm text-gray-600">Mise initiale</div>
                            <div class="font-semibold">${session.initialAmount}€</div>
                        </div>
                        <div class="bg-gray-50 p-3 rounded-lg">
                            <div class="text-sm text-gray-600">Montant final</div>
                            <div class="font-semibold">${session.currentAmount}€</div>
                        </div>
                    </div>
                </div>`;
        });
    }

    html += '</div>';
    container.innerHTML = html;
}

// Mettre à jour le montant actuel et l'étape max de la session courante
export function updateSessionProgress(wonBets) {
    if (!currentSession) return;

    let currentAmount = currentSession.initialAmount;
    wonBets.forEach(bet => {
        currentAmount *= parseFloat(bet.totalOdd);
    });

    currentSession.currentAmount = Math.round(currentAmount * 100) / 100;
    currentSession.maxStep = wonBets.length;
    currentSession.bets = window.bets; // Sauvegarde des paris de la session

    saveCurrentSession();
    updateSessionsDisplay();
}

// Exposer les fonctions nécessaires globalement
window.startNewSession = startNewSession;
window.endCurrentSession = endCurrentSession;
