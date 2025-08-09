# Documentation Site

## Requirements
    0. The UI must Header, Footer and Middle Panel
       a. Middle panel, must have menu, content and side panel.
       b. Must have light theme, like stripe.docs.com - tailwind prefereably.
    1. Reads Guide Markddown content places inside docs/guides
        a. multi lingual support for en and ar, placed under respective sub folders.
        b. mulit version support for respective en and ar languages, placed under respective sub folders.
        c. Guide tab should show different markdown files as menu items, and should render markdown with images included, on the content frame.
        d. Version drop down on the header must change the menu and reflect correct markdown spec and language selected, on the content frame.
        e. Side Panel must sohw a feature called "on this page", specififcally for markdown
    5. Header must have 2 horizaontal sections, upper panel and lower panel.
    6. Header lower panel must show version dropdown - aligned to the right.
        a. Avaiable versions mentioned in application.properties
    6. Header lower panel must show language dropdown (en/ar) - aligned to the right.
        b. Available languages mentioned in application.properties.
        c. Build a custom drop down for the same.
        d. On select of the language the browser must refresh with /en/ or /ar/ prefix.
    7. Header upper panel must have login button - aligned to the right.
        a. Login must redirect to single sign on - to custom keycloack based on OAuth.
    8. Header upper panel must have "noqodi" branch logo - aligned to the left.
    9. Header upper panel must have search bar - aligned in the middle.
        a. Must be able to search all documents under the docs folder and should link to correct document of version and language.
    9. Header Lower panel will have tabs to display all guides, all api specs, all change logs
        a. tabs must show guide folder names as labels, under the language and version selected, on click menu should show respective sub folders and markdowns.
        b  tabs must next show all apispecs, and use the service name in the api spec as labels, based on version and languagge selected, on click of menu must render menu items based on open api spec operation ids.
    8. Footer must have "copy right 2025 noqodi"
    8.  I need are tabs on the header for each folder under  @guides  depends on the curent language, I need dynamic tab creation for all folders under the @guides folder

## Technology Stack
    1. Astrodocs + Starlight

## Build 
    1. Docker Image

## Deployment
    1. Local - Docker Desktop / Kind
    2. Dev, Qa, UAT, Prod - Kubernetes - Kustomize overlays

## Astro Rules
    1. Avoid sidebar recommendation, it does not work