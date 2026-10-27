# CS452/652 Railway Control Showcase

An interactive portfolio site for a completed University of Waterloo CS452/652
real-time railway-control project.

**Live showcase:** https://y68wu.github.io/cs452-railway-control-showcase/

This repository is the **presentation layer only**. It contains:

- an original responsive project narrative;
- a clearly labelled browser simulation of a two-train control desk;
- a compressed recording supplied by the project author;
- an original Track B schematic adapted from facts in the public course topology data;
- evidence-backed implementation summaries from the private course repository.

It deliberately does **not** contain the course assignment solution or the
train-control source. University of Waterloo course guidance says assignment
solutions should not be published publicly.

## Run locally

The site is buildless:

```sh
python3 -m http.server 4173 -d dist
```

Then open `http://localhost:4173`.

## Browser model

The control desk accepts a presentation-safe subset of the completed project’s
console vocabulary:

```text
dispatch <train> <A-F|CURRENT> <speed 1..120> <d1-d8>
go
trips
reroute <train> <speed 1..120> <d1-d8>
cancel <train>
remove <train>
block <segment>
unblock <segment>
blocks
trackview
```

The animation uses three Track B route cycles—left inner, right inner, and a
main circuit combining the right outer and left inner arcs—with sensor order
and loop distances derived from the public course data.
Its drawing, positions, speeds, and timing remain explanatory simulation data;
it is not connected to the physical railway and is not a safety validation.

## Sources and boundaries

- Public course track materials:
  https://student.cs.uwaterloo.ca/~cs452/S26/track/
- University of Waterloo Mathematics code-sharing guidance:
  https://uwaterloo.ca/math/code-sharing-guidelines

The adapted schematic is original and not to scale. Public course data is
credited but not redistributed here. No University endorsement is implied.

## License

Website code and original visual design are available under the MIT License.
The demo video remains © its project author and is included for this showcase.
University course names, specifications, and linked course data remain the
property of their respective owners and are not covered by this repository’s
license.
