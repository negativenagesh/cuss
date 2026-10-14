#!/bin/bash
# Fake `cursor` CLI for tests: mimics `cursor agent create-chat` and
# `cursor agent --print --output-format stream-json --stream-partial-output --resume <id> <prompt>`.
set -u
if [ "${1:-}" = "agent" ] && [ "${2:-}" = "create-chat" ]; then
  echo "chat-fake-0001"
  exit 0
fi
if [ "${1:-}" = "agent" ]; then
  # extract prompt (last arg) and chat id (arg after --resume)
  PROMPT="${@: -1}"
  CHATID=""
  PREV=""
  for a in "$@"; do
    if [ "$PREV" = "--resume" ]; then CHATID="$a"; fi
    PREV="$a"
  done
  echo "{\"type\":\"system\",\"subtype\":\"init\",\"chatId\":\"$CHATID\"}"
  sleep 0.05
  echo "{\"type\":\"assistant\",\"delta\":\"working on: $PROMPT\"}"
  sleep 0.05
  echo "{\"type\":\"tool_call\",\"name\":\"read_file\",\"status\":\"running\"}"
  sleep 0.05
  echo "{\"type\":\"result\",\"status\":\"done\",\"text\":\"finished $PROMPT\"}"
  exit 0
fi
echo "unexpected args: $*" >&2
exit 2
