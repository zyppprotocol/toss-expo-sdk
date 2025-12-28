// src/nfc.ts
import NfcManager, { NfcTech, Ndef } from 'react-native-nfc-manager';
import type { TossUser } from './types/tossUser';
import type { SolanaIntent } from './intent';

// Start the manager
export function initNFC() {
  return NfcManager.start();
}

// Read NFC tag containing a TossUser
export async function readNFCUser(): Promise<TossUser> {
  try {
    await NfcManager.requestTechnology(NfcTech.Ndef);
    const tag = await NfcManager.getTag();
    await NfcManager.cancelTechnologyRequest();

    if (!tag?.ndefMessage?.[0]?.payload) {
      throw new Error('No NDEF message found');
    }

    const message = Ndef.uri.decodePayload(tag.ndefMessage[0].payload as any);
    return JSON.parse(message) as TossUser;
  } catch (ex: unknown) {
    await NfcManager.cancelTechnologyRequest();
    throw new Error(`Failed to read user from NFC: ${String(ex)}`);
  }
}

export async function writeUserToNFC(user: TossUser): Promise<boolean> {
  try {
    await NfcManager.requestTechnology(NfcTech.Ndef);
    const jsonUser = JSON.stringify(user);
    const bytes = Ndef.encodeMessage([Ndef.uriRecord(jsonUser)]);
    await NfcManager.ndefHandler.writeNdefMessage(bytes);
    await NfcManager.cancelTechnologyRequest();
    return true;
  } catch (ex: unknown) {
    await NfcManager.cancelTechnologyRequest();
    throw new Error(`Failed to write user to NFC: ${String(ex)}`);
  }
}

// Write SolanaIntent to NFC tag
export async function writeIntentToNFC(intent: SolanaIntent): Promise<boolean> {
  try {
    await NfcManager.requestTechnology(NfcTech.Ndef);
    const jsonIntent = JSON.stringify(intent);
    const bytes = Ndef.encodeMessage([Ndef.uriRecord(jsonIntent)]);
    await NfcManager.ndefHandler.writeNdefMessage(bytes);
    await NfcManager.cancelTechnologyRequest();
    return true;
  } catch (ex: unknown) {
    await NfcManager.cancelTechnologyRequest();
    throw new Error(`Failed to write intent to NFC: ${String(ex)}`);
  }
}
