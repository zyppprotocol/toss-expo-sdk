import { View, StyleSheet, Text } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
  type Code,
} from 'react-native-vision-camera';

type QRScannerProps = {
  onScan: (data: string) => void;
};

export function QRScanner({ onScan }: QRScannerProps) {
  const device = useCameraDevice('back');
  const permission = useCameraPermission();

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'], //  correct CodeType
    onCodeScanned: (codes: Code[]) => {
      const code = codes[0];
      if (!code?.value) return; //  undefined-safe

      onScan(code.value);
    },
  });

  if (!permission.hasPermission) {
    return (
      <View style={styles.center}>
        <Text>Camera permission not granted</Text>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.center}>
        <Text>Camera not available</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        codeScanner={codeScanner}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
