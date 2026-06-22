import { useEffect } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

const BG     = '#09100e';
const CARD   = '#162019';
const BORDER = '#1e3028';
const MUTED  = '#6b7a74';
const WHITE  = '#e8f0ec';

// The Zum Connect SDK hosted on Zum Rails CDN. Switch to production URL when going live.
const ZUM_SDK_URL = 'https://sandbox-cdn.zumrails.com/sandbox/zumsdk.js';

function buildSdkHtml(token: string): string {
  // JSON.stringify ensures the token is safely escaped in the JS context.
  const safeToken = JSON.stringify(token);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #09100e; width: 100vw; height: 100vh; overflow: hidden; }
  </style>
</head>
<body>
  <div id="zc"></div>
  <script src="${ZUM_SDK_URL}"></script>
  <script>
    (function () {
      function send(msg) {
        try {
          var str = JSON.stringify(msg);
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(str);
          } else {
            window.parent.postMessage(JSON.parse(str), '*');
          }
        } catch (e) {}
      }
      try {
        ZumRailsSDK.init({
          token: ${safeToken},
          onLoad: function () {},
          onSuccess: function (data) { send({ type: 'success', data: data }); },
          onError: function (error) { send({ type: 'error', error: String(error) }); },
          onButtonClose: function () { send({ type: 'close' }); }
        });
      } catch (e) {
        send({ type: 'error', error: e.message || String(e) });
      }
    })();
  </script>
</body>
</html>`;
}

type Props = {
  visible: boolean;
  token: string;
  title?: string;
  onSuccess: (zumrailsUserId: string) => void;
  onClose: () => void;
};

function parseMessage(raw: unknown): { type: string; data?: Record<string, unknown>; error?: string } | null {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed.type === 'string') return parsed as { type: string; data?: Record<string, unknown>; error?: string };
    return null;
  } catch {
    return null;
  }
}

// Web platform: render an iframe in a modal using a ref.
// We can't import WebView statically on web (native module), so we use conditional require.
function NativeWebViewModal({ visible, html, title, onMessage, onClose }: {
  visible: boolean;
  html: string;
  title: string;
  onMessage: (data: string) => void;
  onClose: () => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const WebView = require('react-native-webview').default;
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={st.nativeContainer}>
        <View style={st.header}>
          <Text style={st.headerTitle}>{title}</Text>
          <Pressable style={st.closeBtn} onPress={onClose}>
            <Text style={st.closeBtnText}>✕</Text>
          </Pressable>
        </View>
        <WebView
          source={{ html }}
          onMessage={(e: { nativeEvent: { data: string } }) => onMessage(e.nativeEvent.data)}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          style={{ flex: 1, backgroundColor: BG }}
        />
      </View>
    </Modal>
  );
}

// Web platform: render an iframe inside a modal overlay.
function WebIframeModal({ visible, html, title, onMessage, onClose }: {
  visible: boolean;
  html: string;
  title: string;
  onMessage: (data: unknown) => void;
  onClose: () => void;
}) {
  // Register the postMessage listener once when the modal becomes visible,
  // and clean it up when it hides or unmounts. The previous inline approach
  // added the listener on every render and removed it on the next tick via
  // setTimeout, so the listener was always gone by the time the iframe fired.
  useEffect(() => {
    if (!visible) return;
    function handler(e: MessageEvent) {
      console.log('[ZumConnectModal] postMessage received — origin:', e.origin, '| data:', JSON.stringify(e.data));
      if (!e.data) return;
      if (e.data.origin === 'ZUM_RAILS' || typeof e.data.type === 'string') {
        onMessage(e.data);
      }
    }
    console.log('[ZumConnectModal] attaching postMessage listener');
    window.addEventListener('message', handler);
    return () => {
      console.log('[ZumConnectModal] removing postMessage listener');
      window.removeEventListener('message', handler);
    };
  }, [visible, onMessage]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={st.webOverlay}>
        <View style={st.webSheet}>
          <View style={st.header}>
            <Text style={st.headerTitle}>{title}</Text>
            <Pressable style={st.closeBtn} onPress={onClose}>
              <Text style={st.closeBtnText}>✕</Text>
            </Pressable>
          </View>
          {visible && (
            <iframe
              srcDoc={html}
              style={{ flex: 1, border: 'none', width: '100%', height: '100%', backgroundColor: BG }}
              title="Zum Connect"
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

export function ZumConnectModal({ visible, token, title = 'Link Bank Account', onSuccess, onClose }: Props) {
  if (!token) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <View style={[st.nativeContainer, { alignItems: 'center', justifyContent: 'center' }]}>
          <ActivityIndicator color="#4169E1" size="large" />
        </View>
      </Modal>
    );
  }

  const html = buildSdkHtml(token);

  function handleRawMessage(raw: unknown) {
    console.log('[ZumConnectModal] handleRawMessage — raw:', JSON.stringify(raw));
    const msg = parseMessage(raw);
    if (!msg) {
      console.log('[ZumConnectModal] could not parse message, ignoring');
      return;
    }
    console.log('[ZumConnectModal] parsed — type:', msg.type, '| data:', JSON.stringify(msg.data));
    if (msg.type === 'success') {
      const userId: string =
        (msg.data?.userId as string) ??
        (msg.data?.UserId as string) ??
        '';
      console.log('[ZumConnectModal] success — userId:', userId || '(empty — check data keys above)');
      if (userId) onSuccess(userId);
      else onClose();
    } else if (msg.type === 'close' || msg.type === 'error') {
      console.log('[ZumConnectModal] close/error — type:', msg.type);
      onClose();
    }
  }

  if (Platform.OS === 'web') {
    return (
      <WebIframeModal
        visible={visible}
        html={html}
        title={title}
        onMessage={handleRawMessage}
        onClose={onClose}
      />
    );
  }

  return (
    <NativeWebViewModal
      visible={visible}
      html={html}
      title={title}
      onMessage={(s) => handleRawMessage(s)}
      onClose={onClose}
    />
  );
}

const st = StyleSheet.create({
  nativeContainer: { flex: 1, backgroundColor: BG },
  webOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  webSheet: {
    backgroundColor: BG,
    height: '85%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: CARD,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: WHITE },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: { fontSize: 14, color: MUTED, fontWeight: '700' },
});
