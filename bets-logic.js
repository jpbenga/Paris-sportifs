import { db, betsRef, firebaseFunctions } from './firebase.js';
import { generateId } from './utils.js';

let bets = [];
let mise = 10;
let isSyncing = false;

// Fonction de validation des cotes individuelles
function validateIndividualOdd(odd) {
    const numOdd = parseFloat(odd);
    return numOdd >= 1.25 && numOdd <= 1.82;
}

// Fonction de validation de la cote totale
function validateOdds(match1, match2) {
    if (!match1) return false;
    const totalOdds = match2 ? match1 * match2 : match1;
    return totalOdds >= 1.58 && totalOdds <= 1.87;
}

// Fonction pour calculer les projections
function calculateProjections() {
    let projection = mise;
    return Array.from({ length: 10 }, (_, i) => {
        projection *= 1.7;
        return Math.round(projection * 100) / 100;
    });
}

// Mettre à jour le statut de synchronisation
function setSyncStatus(status, isError = false) {
    const statusElement = document.getElementById('syncStatus');
    const syncButton = document.getElementById('syncButton');
    
    statusElement.textContent = status;
    statusElement.className = `text-sm px-3 py-1 rounded-full ${
        isError ? 'bg-red-500/20 text-red-100' :
        status === 'Synchronisation...' ? 'bg-yellow-500/20 text-yellow-100' :
        'bg-white/20 text-white'
    }`;
    
    syncButton.classList.toggle('sync-spinner', status === 'Synchronisation...');
}

// Synchronisation des données
export async function syncData() {
    if (isSyncing) return;
    isSyncing = true;
    setSyncStatus('Synchronisation...');
    
    try {
        console.log('Début de la synchronisation...');
        const snapshot = await firebaseFunctions.get(betsRef);
        console.log('Données reçues:', snapshot.val());
        
        const data = snapshot.val();
        if (data) {
            bets = data.bets || [];
            mise = data.mise || 10;
            document.getElementById('miseInitiale').value = mise;
            updateBetsList();
            updateProjections();
            updateStats();
            setSyncStatus('Synchronisé');
        }
    } catch (error) {
        console.error('Erreur de synchronisation:', error);
        setSyncStatus('Erreur de sync', true);
    } finally {
        isSyncing = false;
    }
}

// Sauvegarde des données
export async function saveToServer() {
    setSyncStatus('Sauvegarde...');
    try {
        console.log('Début de la sauvegarde...');
        console.log('Données à sauvegarder:', { bets, mise });

        await firebaseFunctions.set(betsRef, {
            bets,
            mise
        });
        
        console.log('Sauvegarde réussie');
        setSyncStatus('Synchronisé');

        // Vérification immédiate
        const verification = await firebaseFunctions.get(betsRef);
        console.log('Vérification des données sauvegardées:', verification.val());
    } catch (error) {
        console.error('Erreur de sauvegarde:', error);
        setSyncStatus('Erreur de sauvegarde', true);
    }
}

// Ajout d'un nouveau pari
export async function addBet() {
    console.log('Début de l\'ajout d\'un pari...');
    
    const match1 = {
        description: document.getElementById('match1Description').value,
        cote: parseFloat(document.getElementById('match1Cote').value)
    };
    
    const match2 = {
        description: document.getElementById('match2Description').value,
        cote: document.getElementById('match2Cote').value ? parseFloat(document.getElementById('match2Cote').value) : null
    };

    // Validations
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
        status: 'pending',
        timestamp: Date.now()
    };

    console.log('Nouveau pari à ajouter:', newBet);
    
    // Ajout au tableau local
    bets.push(newBet);

    // Reset du formulaire
    document.getElementById('match1Description').value = '';
    document.getElementById('match1Cote').value = '';
    document.getElementById('match2Description').value = '';
    document.getElementById('match2Cote').value = '';

    // Mise à jour de l'interface
    updateBetsList();
    updateProjections();
    updateStats();
    
    // Sauvegarde dans Firebase
    await saveToServer();
}

// Fonction de test Firebase
export async function testFirebaseConnection() {
    const testRef = ref(db, 'test');
    const statusElement = document.getElementById('testStatus');
    const resultElement = document.getElementById('testResult');
    
    try {
        statusElement.textContent = 'Test en cours...';
        statusElement.className = 'text-sm px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-100';
        
        // Test d'écriture
        const testData = {
            timestamp: Date.now(),
            message: 'Test décriture'
        };
        
        console.log('Tentative d\'écriture:', testData);
        await firebaseFunctions.set(testRef, testData);
        console.log('Écriture réussie');
        
        // Test de lecture
        const snapshot = await firebaseFunctions.get(testRef);
        const readData = snapshot.val();
        console.log('Lecture réussie:', readData);
        
        statusElement.textContent = 'Test réussi!';
        statusElement.className = 'text-sm px-3 py-1 rounded-full bg-green-500/20 text-green-100';
        
        resultElement.textContent = JSON.stringify(readData, null, 2);
    } catch (error) {
        console.error('Erreur de test:', error);
        statusElement.textContent = 'Erreur: ' + error.message;
        statusElement.className = 'text-sm px-3 py-1 rounded-full bg-red-500/20 text-red-100';
    }
}

// Mise à jour des statistiques
function updateStats() {
    const wonBets = bets.filter(b => b.status === 'won').length;
    const lostBets = bets.filter(b => b.status === 'lost').length;
    document.getElementById('statsWon').textContent = wonBets;
    document.getElementById('statsLost').textContent = lostBets;
}

// Mise à jour des projections
function updateProjections() {
    const projectionsDiv = document.getElementById('projections');
    const wonBets = bets.filter(b => b.status === 'won').length;
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

// Mise à jour de la liste des paris
function updateBetsList() {
    const betsListDiv = document.getElementById('betsList');
    betsListDiv.innerHTML = bets.map((bet) => `
        <div class="glass-effect rounded-xl p-6 shadow-lg border border-indigo-100">
            <div class="flex justify-between items-start mb-2">
                <div class="flex-1">
                    <div class="flex items-center gap-2 mb-2">
                        <h3 class="text-lg font-semibold text-gray-800">Pari #${bets.indexOf(bet) + 1}</h3>
                        <div class="flex gap-2">
                            ${bet.status === 'pending' ? `
                                <button onclick="updateBetStatus('${bet.id}', 'won')" 
                                        class="text-sm px-3 py-1 bg-green-100 text-green-700 rounded-full hover:bg-green-200">
                                    Gagné
                                </button>
                                <button onclick="updateBetStatus('${bet.id}', 'lost')"
                                        class="text-sm px-3 py-1 bg-red-100 text-red-700 rounded-full hover:bg-red-200">
                                    Perdu
                                </button>
                            ` : bet.status === 'won' ?
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
                    <button onclick="openEditModal('${bet.id}')" 
                            class="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">
                        ✏️
                    </button>
                    <button onclick="deleteBet('${bet.id}')"
                            class="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-red-200">
                        🗑️
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

// Supprimer un pari
export async function deleteBet(betId) {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce pari ?')) {
        bets = bets.filter(b => b.id !== betId);
        updateBetsList();
        updateProjections();
        updateStats();
        await saveToServer();
    }
}

// Mise à jour du statut d'un pari
export async function updateBetStatus(betId, status) {
    const betIndex = bets.findIndex(b => b.id === betId);
    if (betIndex !== -1) {
        bets[betIndex].status = status;
        updateBetsList();
        updateProjections();
        updateStats();
        await saveToServer();
    }
}

// Initialisation
export async function initializeBets() {
    await syncData();
}

window.testFirebaseConnection = testFirebaseConnection;

// Écouter les changements en temps réel
firebaseFunctions.onValue(betsRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
        bets = data.bets || [];
        mise = data.mise || 10;
        document.getElementById('miseInitiale').value = mise;
        updateBetsList();
        updateProjections();
        updateStats();
        setSyncStatus('Synchronisé');
    }
});
