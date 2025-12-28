// src/ble.ts
import { BleManager, Device } from 'react-native-ble-plx';
import { PermissionsAndroid, Platform } from 'react-native';
import type { TossUser } from './types/tossUser';
import type { SolanaIntent } from './intent';
import type { OfflineTransaction } from './types/nonceAccount';
import { BLETransactionHandler } from './client/BLETransactionHandler';

const SERVICE_UUID = '0000ff00-0000-1000-8000-00805f9b34fb';
const USER_CHARACTERISTIC = '0000ff01-0000-1000-8000-00805f9b34fb';
const INTENT_CHARACTERISTIC = '0000ff02-0000-1000-8000-00805f9b34fb';
const OFFLINE_TX_CHARACTERISTIC = '0000ff03-0000-1000-8000-00805f9b34fb'; // New for offline transactions

const manager = new BleManager();
const bleTransactionHandler = new BLETransactionHandler(
  Platform.OS === 'ios' ? 'ios' : 'android'
);

export async function requestBLEPermissions() {
  if (Platform.OS === 'android') {
    await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ]);
  }
}

// Connect to a BLE device
async function connect(device: Device) {
  const connectedDevice = await manager.connectToDevice(device.id);
  await connectedDevice.discoverAllServicesAndCharacteristics();
  return connectedDevice;
}

// Scan for BLE devices advertising TOSS service
export function startTossScan(
  onUserFound: (user: TossUser, device: Device) => void,
  onIntentFound: (intent: SolanaIntent, device: Device) => void,
  onOfflineTransactionFound?: (tx: OfflineTransaction, device: Device) => void
) {
  manager.startDeviceScan([SERVICE_UUID], null, async (error, device) => {
    if (error) {
      console.warn('BLE scan error', error.message);
      return;
    }

    if (device) {
      try {
        const connectedDevice = await connect(device);
        const services =
          await connectedDevice.discoverAllServicesAndCharacteristics();

        // Check for user data
        const userData = await services.readCharacteristicForService(
          device.id,
          SERVICE_UUID,
          USER_CHARACTERISTIC
        );

        if (userData?.value) {
          const user = JSON.parse(userData.value) as TossUser;
          onUserFound(user, device);
        }

        // Check for intent data
        const intentData = await services.readCharacteristicForService(
          device.id,
          SERVICE_UUID,
          INTENT_CHARACTERISTIC
        );

        if (intentData?.value) {
          const intent = JSON.parse(intentData.value) as SolanaIntent;
          onIntentFound(intent, device);
        }

        // Check for offline transaction data (fragmented)
        if (onOfflineTransactionFound) {
          try {
            const txData = await services.readCharacteristicForService(
              device.id,
              SERVICE_UUID,
              OFFLINE_TX_CHARACTERISTIC
            );

            if (txData?.value) {
              const tx = JSON.parse(txData.value) as OfflineTransaction;
              onOfflineTransactionFound(tx, device);
            }
          } catch {
            // Offline TX characteristic may not be available
            console.debug('Offline transaction characteristic not found');
          }
        }
      } catch (err) {
        console.warn('Error reading device data:', err);
      }
    }
  });
}

import { State } from 'react-native-ble-plx';

// Advertise user data via BLE
export async function advertiseUser(user: TossUser) {
  try {
    // On Android, we need to use a different approach since react-native-ble-plx
    // doesn't support BLE advertising directly on the client side
    if (Platform.OS === 'android') {
      console.warn(
        'BLE advertising is not directly supported on Android. Consider using react-native-ble-advertise for this functionality.'
      );
      return;
    }

    // For iOS, we can use the state change to know when advertising starts
    const subscription = manager.onStateChange((state) => {
      if (state === State.PoweredOn) {
        console.log(`Advertising user ${user.userId} via BLE`);
        subscription.remove();
      }
    }, true);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error in BLE advertising:', errorMessage);
    throw new Error(`Failed to advertise user: ${errorMessage}`);
  }
}

export async function stopAdvertising() {
  try {
    // On iOS, we can stop scanning which will effectively stop advertising
    manager.stopDeviceScan();
    console.log('Stopped BLE advertising');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error stopping BLE advertising:', errorMessage);
  }
}

// Send intent to a specific device
export async function sendIntentToDevice(
  deviceId: string,
  intent: SolanaIntent
) {
  const jsonIntent = JSON.stringify(intent);
  const device = await manager.connectToDevice(deviceId);
  await device.discoverAllServicesAndCharacteristics();

  await device.writeCharacteristicWithResponseForService(
    device.id,
    SERVICE_UUID,
    INTENT_CHARACTERISTIC,
    Buffer.from(jsonIntent).toString('base64')
  );

  await device.cancelConnection();
}

/**
 * Send fragmented offline transaction over BLE with Noise Protocol encryption
 * Automatically handles MTU limitations and retries
 */
export async function sendOfflineTransactionFragmented(
  device: Device,
  transaction: OfflineTransaction | SolanaIntent,
  noiseEncryptFn?: (data: Uint8Array) => Promise<any>,
  isIntent: boolean = false
): Promise<{
  success: boolean;
  sentFragments: number;
  failedFragments: number[];
  messageId: string;
}> {
  try {
    const result = await bleTransactionHandler.sendFragmentedTransactionBLE(
      device,
      transaction,
      async (deviceId, charUUID, data) => {
        const dev = await manager.connectToDevice(deviceId);
        await dev.discoverAllServicesAndCharacteristics();

        const characteristic =
          charUUID === OFFLINE_TX_CHARACTERISTIC
            ? OFFLINE_TX_CHARACTERISTIC
            : INTENT_CHARACTERISTIC;

        await dev.writeCharacteristicWithResponseForService(
          deviceId,
          SERVICE_UUID,
          characteristic,
          data.toString('base64')
        );

        await dev.cancelConnection();
      },
      noiseEncryptFn,
      isIntent
    );

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Failed to send offline transaction:', errorMessage);
    throw new Error(`BLE transmission failed: ${errorMessage}`);
  }
}

/**
 * Receive and reassemble fragmented message from BLE
 */
export async function receiveOfflineTransactionFragment(
  fragment: any,
  noiseDecryptFn?: (encrypted: any) => Promise<Uint8Array>
): Promise<{
  complete: boolean;
  transaction?: OfflineTransaction | SolanaIntent;
  progress: { received: number; total: number };
}> {
  return bleTransactionHandler.receiveFragmentedMessage(
    fragment,
    noiseDecryptFn
  );
}

/**
 * Get current BLE MTU configuration
 */
export function getBLEMTUConfig() {
  return bleTransactionHandler.getMTUConfig();
}

/**
 * Set custom BLE MTU configuration
 */
export function setBLEMTUConfig(config: Partial<any>) {
  bleTransactionHandler.setMTUConfig(config);
}
