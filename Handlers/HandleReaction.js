/**
 * Handlers/HandleReaction.js
 * Nhận event "reaction" từ zca-mt và chuyển tới các command có onReaction.
 *
 * Payload thực tế (log hiện có):
 *   reaction.threadId
 *   reaction.data.rIcon
 * Thêm các field thường gặp: data.msgId, data.cliMsgId, data.uidFrom, type
 */
function createHandleReaction(logger, bot = null) {
  return async function handleReaction(reaction) {
    logger?.debug?.("[HandleReaction] Nhận reaction:", {
      threadId: reaction?.threadId,
      icon: reaction?.data?.rIcon,
      msgId: reaction?.data?.msgId || reaction?.data?.rMsgId,
      uid: reaction?.data?.uidFrom || reaction?.data?.reactorId,
    });

    if (!bot?.backgroundHooks?.length) return;

    for (const cmd of [...bot.backgroundHooks]) {
      if (typeof cmd.onReaction !== "function") continue;
      try {
        await cmd.onReaction({
          adapter: bot.adapter,
          reaction,
          config: bot.config,
          db: bot.db,
          logger: bot.logger || logger,
        });
      } catch (err) {
        (bot.logger || logger)?.error?.(
          `[HandleReaction] Lỗi onReaction của '${cmd.name}':`,
          { message: err?.message, stack: err?.stack }
        );
      }
    }
  };
}

export { createHandleReaction };
