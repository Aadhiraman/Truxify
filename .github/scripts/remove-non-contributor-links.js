
'use strict';

const TRUSTED_ASSOCIATIONS = new Set([
  'OWNER',
  'MEMBER',
  'COLLABORATOR',
  'CONTRIBUTOR'
]);

function isNonContributor(association) {
  if (!association) return true;
  return !TRUSTED_ASSOCIATIONS.has(association.toUpperCase());
}

function containsLinks(text) {
  if (typeof text !== 'string' || !text) return false;

  return [
    /(?:https?|ftp):\/\/[^\s<>"')]+/i,
    /\[[^\]]+\]\((?:https?|ftp):\/\/[^\s)]+\)/i,
    /<a\s+[^>]*href=["']?(?:https?|ftp):\/\/[^"'>\s]+["']?[^>]*>.*?<\/a>/i,
    /^\[[^\]]+\]:\s*(?:https?|ftp):\/\/\S+/mi,
    /(?<!https?:\/\/|ftp:\/\/)www\.[^\s<>"')]+/i
  ].some((pattern) => pattern.test(text));
}

function removeLinks(text) {
  if (typeof text !== 'string' || !text) return text;

  let result = text;

  result = result.replace(
    /\[([^\]]+)\]\((?:https?|ftp):\/\/[^\s)]+\)/gi,
    '$1 [link removed for security]'
  );

  result = result.replace(
    /<a\s+[^>]*href=["']?(?:https?|ftp):\/\/[^"'>\s]+["']?[^>]*>(.*?)<\/a>/gi,
    '$1 [link removed for security]'
  );

  result = result.replace(
    /^\[([^\]]+)\]:\s*(?:https?|ftp):\/\/\S+/gmi,
    '[$1]: # [link removed for security]'
  );

  result = result.replace(
    /(?:https?|ftp):\/\/[^\s<>"')]+/gi,
    '[link removed for security]'
  );

  result = result.replace(
    /(?<!https?:\/\/|ftp:\/\/)www\.[^\s<>"')]+/gi,
    '[link removed for security]'
  );

  if (!result.includes('Security Notice:')) {
    result +=
      '\n\n> ⚠️ **Security Notice:** Links posted by non-contributors have been automatically removed.';
  }

  return result;
}

async function run({ github, context, core }) {
  const { owner, repo } = context.repo;
  const payload = context.payload;

  if (payload.comment) {
    const comment = payload.comment;

    if (!isNonContributor(comment.author_association)) {
      core.info('Trusted comment author; skipping.');
      return;
    }

    if (!containsLinks(comment.body)) {
      core.info('No links found in comment; skipping.');
      return;
    }

    await github.rest.issues.updateComment({
      owner,
      repo,
      comment_id: comment.id,
      body: removeLinks(comment.body)
    });

    core.info(`Updated comment ${comment.id}.`);
    return;
  }

  if (payload.issue) {
    const issue = payload.issue;

    if (!isNonContributor(issue.author_association)) {
      core.info('Trusted issue author; skipping.');
      return;
    }

    if (!containsLinks(issue.body)) {
      core.info('No links found in issue; skipping.');
      return;
    }

    await github.rest.issues.update({
      owner,
      repo,
      issue_number: issue.number,
      body: removeLinks(issue.body)
    });

    core.info(`Updated issue #${issue.number}.`);
    return;
  }

  if (payload.pull_request) {
    const pr = payload.pull_request;

    if (!isNonContributor(pr.author_association)) {
      core.info('Trusted PR author; skipping.');
      return;
    }

    if (!containsLinks(pr.body)) {
      core.info('No links found in PR; skipping.');
      return;
    }

    await github.rest.pulls.update({
      owner,
      repo,
      pull_number: pr.number,
      body: removeLinks(pr.body)
    });

    core.info(`Updated PR #${pr.number}.`);
    return;
  }

  core.info('No supported event payload found.');
}

async function scanAll({ github, context, core }) {
  const { owner, repo } = context.repo;

  core.info(`Scanning ${owner}/${repo} for links from non-contributors.`);

  const issues = await github.paginate(
    github.rest.issues.listForRepo,
    {
      owner,
      repo,
      state: 'all',
      per_page: 100
    }
  );

  let updatedItems = 0;
  let updatedComments = 0;

  for (const issue of issues) {
    if (
      isNonContributor(issue.author_association) &&
      containsLinks(issue.body)
    ) {
      const body = removeLinks(issue.body);

      if (issue.pull_request) {
        await github.rest.pulls.update({
          owner,
          repo,
          pull_number: issue.number,
          body
        });
      } else {
        await github.rest.issues.update({
          owner,
          repo,
          issue_number: issue.number,
          body
        });
      }

      updatedItems++;
    }

    const comments = await github.paginate(
      github.rest.issues.listComments,
      {
        owner,
        repo,
        issue_number: issue.number,
        per_page: 100
      }
    );

    for (const comment of comments) {
      if (
        isNonContributor(comment.author_association) &&
        containsLinks(comment.body)
      ) {
        await github.rest.issues.updateComment({
          owner,
          repo,
          comment_id: comment.id,
          body: removeLinks(comment.body)
        });

        updatedComments++;
      }
    }
  }

  core.info(
    `Scan complete. Updated ${updatedItems} issue/PR descriptions and ${updatedComments} comments.`
  );
}

module.exports = {
  isNonContributor,
  containsLinks,
  removeLinks,
  run,
  scanAll
};
