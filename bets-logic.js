import { db, betsRef, firebaseFunctions } from './firebase.js';
import { updateUI } from './ui.js';
import { generateId, validateOdds, validateIndividualOdd } from './utils.js';

let bets = [];
let mise = 10;
let isSyncing = false;

export async function syncData() {
    if (isSyncing) return;
    isSyncing = true;
    setSyncStatus('Synchronisation...');
    
    try {
        const snapshot = await firebaseFunctions.get(betsRef);
        const data = snapshot.val();
        if (data) {
            bets = data.bets || [];
            mise = data.mise || 10;
            updateUI(bets, mise);
            setSyncStatus('Synchronisé');
        }
    } catch (error) {
        console.error('Erreur de synchronisation:', error);
        setSyncStatus('Erreur de sync', true);
    } finally {
        isSyncing = false;
    }
}

export async function saveTo