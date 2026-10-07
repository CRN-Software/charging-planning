<script setup lang="ts">
useHead({ title: 'Confidentialité · Semaine de charge' });
</script>

<template>
  <article class="legal">
    <NuxtLink to="/">← Semaine de charge</NuxtLink>
    <h1>Confidentialité</h1>
    <p>
      Semaine de charge planifie la recharge d'un véhicule électrique à partir des agendas d'un
      foyer. Cette page décrit les données utilisées, pourquoi, et comment les supprimer.
    </p>

    <h2>Compte Google</h2>
    <p>
      La connexion se fait avec Google. L'application reçoit votre nom, votre adresse e-mail et
      votre photo de profil pour vous identifier, ainsi qu'un accès
      <strong>en lecture seule</strong>
      à vos agendas : elle lit la date, l'heure et le lieu des événements pour reconstruire les
      déplacements du foyer. Elle ne crée, ne modifie et ne supprime aucun événement.
    </p>

    <h2>Véhicule Tesla</h2>
    <p>
      Si vous reliez un véhicule, l'application lit son niveau de batterie, son état de charge et sa
      position, uniquement quand il est déjà éveillé : elle ne le réveille jamais. La position sert
      à vérifier que le véhicule se trouve là où les agendas le prévoient.
    </p>

    <h2>Stockage et partage</h2>
    <ul>
      <li>
        Les données sont stockées sur un serveur situé en France et ne sont ni vendues ni partagées.
      </li>
      <li>Les jetons d'accès Google et Tesla sont chiffrés.</li>
      <li>
        Les adresses des événements sont géolocalisées avec OpenStreetMap (Nominatim) et les trajets
        calculés avec OSRM ; seuls les lieux sont transmis, jamais les noms ni les titres.
      </li>
      <li>Les journaux techniques ne contiennent ni adresse IP ni identifiant.</li>
    </ul>

    <h2>Suppression</h2>
    <p>
      Vous pouvez retirer l'accès à tout moment depuis votre compte Google (<a
        href="https://myaccount.google.com/permissions"
        >myaccount.google.com/permissions</a
      >) ou Tesla. Pour supprimer toutes vos données, écrivez à
      <a href="mailto:support@crn-tech.fr">support@crn-tech.fr</a>.
    </p>
  </article>
</template>
