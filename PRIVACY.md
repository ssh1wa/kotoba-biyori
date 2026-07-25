# Privacy

Last updated: July 26, 2026

KotobaBiyori is a bring-your-own-key Android application. It has no
KotobaBiyori account system, advertising SDK, analytics service, or
KotobaBiyori-operated backend server.

## Data Stored on the Device

The app stores settings, learning history, check-in dates, course progress,
roleplay conversations, roleplay memories, and vocabulary entries on the
device. API keys are stored using Expo SecureStore and are excluded from
exported backup files.

## Data Sent to Model Providers

When a user requests a translation, exercise, explanation, or roleplay reply,
the app sends the relevant prompt, user text, selected learning context, and
conversation context directly to the API provider configured by the user.
This may include OpenAI-compatible services such as DeepSeek or the Google
Gemini API.

Those transmissions are governed by the selected provider's own terms and
privacy policy. Users should not submit sensitive personal information unless
they accept the selected provider's data practices.

## Backup Files

Exported JSON backups may contain learning records, conversations, memories,
settings, and check-in dates. They do not contain API keys. Users are
responsible for protecting backup files and deleting copies they no longer
need.

## Deleting Data

Local app data can be removed by clearing KotobaBiyori's Android storage or
uninstalling the app. Data retained by an API provider must be managed through
that provider.

## Contact

Privacy questions may be submitted through the repository's GitHub Issues
page. Do not include API keys, private conversations, or other sensitive data
in a public issue.
