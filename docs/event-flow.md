<!-- Generated from packages/schema/schemas/event-flow.json by packages/schema/scripts/generate.ts. Do not edit. -->

# Event flow

Each arrow is a declared edge: an event of the arrow's target type may follow one of its source type in a session log (Q68(b)). The FX e2e tests check that every observed pair is declared.

```mermaid
flowchart LR
  subgraph code_only["code-only"]
    config_accepted["config.accepted"]
    decision_recommendation_revealed["decision.recommendation.revealed"]
    loop_halted["loop.halted"]
    loop_handoff_failed["loop.handoff.failed"]
    loop_iteration_started["loop.iteration.started"]
    loop_reminder_sent["loop.reminder.sent"]
    loop_tool_called["loop.tool.called"]
    loop_tool_skipped["loop.tool.skipped"]
    loop_tool_started["loop.tool.started"]
    message_appended["message.appended"]
    run_started["run.started"]
    run_terminated["run.terminated"]
  end
  subgraph floor_event["floor-event"]
    floor_checked["floor.checked"]
    floor_signalled["floor.signalled"]
  end
  subgraph intake_event["intake-event"]
    intake_classified["intake.classified"]
    intake_overridden["intake.overridden"]
    intake_reclassified["intake.reclassified"]
  end
  subgraph object_event["object-event"]
    artifact_recorded["artifact.recorded"]
    decision_footprint_recorded["decision.footprint.recorded"]
    decision_opened["decision.opened"]
    decision_outcome_signalled["decision.outcome.signalled"]
    run_recorded["run.recorded"]
    task_created["task.created"]
  end
  subgraph permission_event["permission-event"]
    permission_answered["permission.answered"]
    permission_asked["permission.asked"]
    permission_evaluated["permission.evaluated"]
    permission_rejected["permission.rejected"]
  end
  config_accepted --> floor_signalled
  config_accepted --> intake_classified
  config_accepted --> intake_reclassified
  config_accepted --> run_terminated
  decision_opened --> decision_opened
  decision_opened --> floor_checked
  decision_opened --> floor_signalled
  decision_opened --> intake_overridden
  decision_opened --> intake_reclassified
  decision_opened --> message_appended
  decision_opened --> permission_evaluated
  decision_opened --> permission_rejected
  decision_opened --> run_terminated
  floor_checked --> run_terminated
  floor_signalled --> decision_opened
  floor_signalled --> floor_checked
  floor_signalled --> floor_signalled
  floor_signalled --> intake_reclassified
  floor_signalled --> loop_halted
  floor_signalled --> message_appended
  floor_signalled --> run_terminated
  intake_classified --> decision_opened
  intake_overridden --> message_appended
  intake_reclassified --> decision_opened
  loop_halted --> floor_signalled
  loop_halted --> intake_reclassified
  loop_halted --> loop_handoff_failed
  loop_halted --> message_appended
  loop_halted --> permission_answered
  loop_halted --> run_terminated
  loop_handoff_failed --> floor_signalled
  loop_handoff_failed --> intake_reclassified
  loop_handoff_failed --> run_terminated
  loop_iteration_started --> floor_signalled
  loop_iteration_started --> intake_reclassified
  loop_iteration_started --> loop_halted
  loop_iteration_started --> message_appended
  loop_iteration_started --> run_terminated
  loop_reminder_sent --> floor_signalled
  loop_reminder_sent --> intake_reclassified
  loop_reminder_sent --> loop_halted
  loop_reminder_sent --> loop_iteration_started
  loop_reminder_sent --> loop_tool_skipped
  loop_reminder_sent --> loop_tool_started
  loop_reminder_sent --> message_appended
  loop_reminder_sent --> run_terminated
  loop_tool_called --> message_appended
  loop_tool_skipped --> loop_halted
  loop_tool_skipped --> message_appended
  loop_tool_started --> loop_halted
  loop_tool_started --> loop_tool_called
  loop_tool_started --> permission_evaluated
  loop_tool_started --> permission_rejected
  message_appended --> floor_signalled
  message_appended --> intake_reclassified
  message_appended --> loop_halted
  message_appended --> loop_iteration_started
  message_appended --> loop_reminder_sent
  message_appended --> loop_tool_skipped
  message_appended --> loop_tool_started
  message_appended --> message_appended
  message_appended --> run_terminated
  permission_answered --> config_accepted
  permission_answered --> floor_signalled
  permission_answered --> intake_overridden
  permission_answered --> intake_reclassified
  permission_answered --> loop_halted
  permission_answered --> loop_tool_called
  permission_answered --> run_terminated
  permission_asked --> loop_halted
  permission_asked --> permission_answered
  permission_evaluated --> loop_halted
  permission_evaluated --> loop_tool_called
  permission_evaluated --> permission_asked
  permission_rejected --> floor_signalled
  permission_rejected --> intake_reclassified
  permission_rejected --> loop_halted
  permission_rejected --> loop_tool_called
  permission_rejected --> run_terminated
  run_recorded --> run_started
  run_started --> config_accepted
  run_started --> floor_signalled
  run_started --> intake_classified
  run_started --> intake_reclassified
  run_started --> permission_evaluated
  run_started --> permission_rejected
  run_started --> run_terminated
  run_terminated --> run_recorded
  run_terminated --> run_started
  run_terminated --> task_created
  task_created --> run_recorded
```
