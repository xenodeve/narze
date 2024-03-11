@echo off
title @narze
:startover
:loop
echo (%time%) [RUN] Narze started.
node .
echo (%time%) [WARNING] Narze closed or crashed, restarting.
goto startover