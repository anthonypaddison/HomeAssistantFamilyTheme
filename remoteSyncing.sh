push-ha-remote() {
  cd "$HOME/Projects/HomeAssistantFamilyTheme" >/dev/null 2>&1 \
    && echo "state1: changed directory" \
    && git add . >/dev/null 2>&1 \
    && echo "state2: staged changes" \
    && {
         if git diff --cached --quiet; then
           echo "state3: nothing to commit"
         else
           git commit -m "HA - WIP" >/dev/null 2>&1 \
             && echo "state3: committed changes" \
             || echo "state3: commit failed"
         fi
       } \
    && git push >/dev/null 2>&1 \
    && echo "state4: pushed to remote" \
    && ssh -o ConnectTimeout=8 root@100.90.139.75 \
         "nohup bash -lc 'cd homeassistant && git pull origin main && ha core restart' >/dev/null 2>&1 &"$ \
    && echo "state5: updated Home Assistant" \
    && {
         sshpass -p 'Toby3639' ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no anthonypaddison@192.16$
           "echo 'Toby3639' | sudo -S reboot" >/dev/null 2>&1 \
           && echo "state6: rebooted tablet" \
           || echo "state6: skipped tablet reboot (unreachable)";
       } \
    && echo "state7: all steps complete"
}

push-ha-local() {
  cd /Users/anthonypaddison/Projects/HomeAssistantFamilyTheme >/dev/null 2>&1 \
    && echo "state1: changed directory" \
    && git add . >/dev/null 2>&1 \
    && echo "state2: staged changes" \
    && git commit -m "HA - WIP" >/dev/null 2>&1 \
    && echo "state3: committed changes" \
    && git push >/dev/null 2>&1 \
    && echo "state4: pushed to remote" \
    && ssh root@192.168.1.81 "nohup bash -c 'cd homeassistant && git pull origin main && ha core restart' >/dev/null 2>&1 &" \
    && echo "state5: updated Home Assistant" \
    && sshpass -p 'Toby3639' ssh anthonypaddison@192.168.1.199 "echo 'Toby3639' | sudo -S reboot" >/dev/null 2>&1 \
    && echo "state6: rebooted tablet" \
    && echo "state7: all steps complete"
}