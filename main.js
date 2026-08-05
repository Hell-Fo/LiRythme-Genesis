/*
===============================================================================

LiRythme – Genesis

Linear Parallel Hybrid Rhythm Companion

LiRythme extends the creative capabilities of your drum machine.

It is not a drum machine.
It is not a DAW.

It is a rhythmic composition instrument designed to work alongside
the instruments you already love.

-------------------------------------------------------------------------------

Main Process

This file is the conductor of the application.

It creates the main window, starts Electron and coordinates the
application lifecycle.

-------------------------------------------------------------------------------

Created by:
Daniel Coupal

Design Assistant & Programmer:
Elias (OpenAI)

Project:
Genesis

===============================================================================
*/
const { app, BrowserWindow } = require("electron");

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800
    });

    mainWindow.loadFile("index.html");
}

app.whenReady().then(createWindow);