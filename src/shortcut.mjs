import { randomUUID } from 'node:crypto';

const variable = (value) => ({ Value: value, WFSerializationType: 'WFTextTokenAttachment' });
const text = (string) => ({ Value: { string }, WFSerializationType: 'WFTextTokenString' });

export function shortcutDefinition({ url, token }) {
  const requestId = randomUUID();
  return {
    WFWorkflowName: 'Send to Codex',
    WFWorkflowClientVersion: '3030.0.4',
    WFWorkflowMinimumClientVersion: 900,
    WFWorkflowMinimumClientVersionString: '900',
    WFWorkflowIcon: { WFWorkflowIconStartColor: 463140863, WFWorkflowIconGlyphNumber: 59511 },
    WFWorkflowTypes: ['ActionExtension'],
    WFWorkflowInputContentItemClasses: ['WFImageContentItem'],
    WFWorkflowOutputContentItemClasses: [],
    WFWorkflowHasShortcutInputVariables: true,
    WFWorkflowImportQuestions: [],
    WFWorkflowActions: [
      {
        WFWorkflowActionIdentifier: 'is.workflow.actions.downloadurl',
        WFWorkflowActionParameters: {
          UUID: requestId,
          WFURL: text(url),
          WFHTTPMethod: 'POST',
          ShowHeaders: true,
          WFHTTPHeaders: {
            WFSerializationType: 'WFDictionaryFieldValue',
            Value: { WFDictionaryFieldValueItems: [
              { WFItemType: 0, WFKey: text('Authorization'), WFValue: text(`Bearer ${token}`) },
            ] },
          },
          WFHTTPBodyType: 'File',
          WFRequestVariable: variable({ Type: 'ExtensionInput' }),
        },
      },
      {
        WFWorkflowActionIdentifier: 'is.workflow.actions.notification',
        WFWorkflowActionParameters: {
          WFNotificationActionTitle: 'Screenshot Inbox',
          WFNotificationActionSound: false,
          WFNotificationActionBody: {
            WFSerializationType: 'WFTextTokenString',
            Value: {
              string: '\uFFFC',
              attachmentsByRange: { '{0, 1}': { Type: 'ActionOutput', OutputUUID: requestId, OutputName: 'Contents of URL' } },
            },
          },
        },
      },
    ],
  };
}

export function toPlist(value) {
  const escape = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
  function encode(item) {
    if (typeof item === 'string') return `<string>${escape(item)}</string>`;
    if (typeof item === 'boolean') return item ? '<true/>' : '<false/>';
    if (Number.isInteger(item)) return `<integer>${item}</integer>`;
    if (Array.isArray(item)) return `<array>${item.map(encode).join('')}</array>`;
    if (item && typeof item === 'object') return `<dict>${Object.entries(item).map(([key, val]) => `<key>${escape(key)}</key>${encode(val)}`).join('')}</dict>`;
    throw new Error('Unsupported property-list value');
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">${encode(value)}</plist>\n`;
}
