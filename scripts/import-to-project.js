const fs = require("fs");
const { graphql } = require("@octokit/graphql");

(async () => {
  try {
    const jsonData = JSON.parse(fs.readFileSync("learning-plan.json", "utf8"));

    const graphqlWithAuth = graphql.defaults({
      headers: {
        authorization: `bearer ${process.env.GH_PAT}`,
      },
    });

    const projectId = process.env.PROJECT_ID;
    const repositoryId = process.env.REPO_ID;
    console.log("repo id:",repositoryId);
    console.log("project id:",projectId);

    // 1️⃣ Fetch all project fields and their single-select options
    const fieldsResult = await graphqlWithAuth(
      `
      query($projectId: ID!) {
        node(id: $projectId) {
          ... on ProjectV2 {
            fields(first: 50) {
              nodes {
                __typename
                ... on ProjectV2SingleSelectField {
                  id
                  name
                  options {
                    id
                    name
                  }
                }
              }
            }
          }
        }
      }
      `,
      { projectId }
    );

    const projectFields = fieldsResult.node.fields.nodes;

    // Find the Status field and map option names to IDs
    const statusField = projectFields.find(
      f => f.__typename === "ProjectV2SingleSelectField" && f.name.toLowerCase() === "status"
    );

    const statusMap = {};
    if (statusField) {
      for (const option of statusField.options) {
        statusMap[option.name.toLowerCase()] = option.id;
      }
    } else {
      console.warn("⚠️ Status field not found. Tasks will be added without status.");
    }

    // 2️⃣ Loop through tasks
    for (const task of jsonData.items) {
      console.log(`Creating issue: ${task.title}`);

      // Create issue in repository
      const createIssue = await graphqlWithAuth(
        `
        mutation($repositoryId: ID!, $title: String!, $body: String) {
          createIssue(input: { repositoryId: $repositoryId, title: $title, body: $body }) {
            issue { id }
          }
        }
        `,
        {
          repositoryId,
          title: task.title,
          body: task.body || "",
        }
      );

      const issueId = createIssue.createIssue.issue.id;

      // Add issue to Project V2
      const addToProject = await graphqlWithAuth(
        `
        mutation($projectId: ID!, $contentId: ID!) {
          addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
            item { id }
          }
        }
        `,
        { projectId, contentId: issueId }
      );

      const projectItemId = addToProject.addProjectV2ItemById.item.id;

      // Set Status if field and option exist
      if (statusField && task.status) {
        const optionId = statusMap[task.status.toLowerCase()];
        if (optionId) {
          await graphqlWithAuth(
            `
            mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
              updateProjectV2ItemFieldValue(input: {
                projectId: $projectId,
                itemId: $itemId,
                fieldId: $fieldId,
                value: { singleSelectOptionId: $optionId }
              }) {
                projectV2Item { id }
              }
            }
            `,
            {
              projectId,
              itemId: projectItemId,
              fieldId: statusField.id,
              optionId,
            }
          );
          console.log(`Status set to: ${task.status}`);
        } else {
          console.warn(`⚠️ Status option "${task.status}" not found in project. Skipping status.`);
        }
      }

      console.log(`✅ Task added: ${task.title}`);
    }

    console.log("🎉 All tasks imported successfully!");
  } catch (error) {
    console.error("❌ Error importing tasks:", error);
    process.exit(1);
  }
})();
