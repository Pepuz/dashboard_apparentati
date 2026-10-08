# Project rules — dashboard_apparentati

- The TV gets its IP address from the router (DHCP): before any `ares-*` command, read the current IP in the TV's Developer Mode app and update the registered device with `ares-setup-device --modify tv -i "host=<ip>"`.
- Every migration ships with a check query that verifies everything it creates (columns, constraints, RLS, policies, grants), not only the grants: a partly applied script once left `meal_defaults` without policies.
